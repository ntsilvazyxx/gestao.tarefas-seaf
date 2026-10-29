# Fluxo — gestão de tarefas

Aplicação inicial para criar tarefas, encaminhá-las entre pessoas, devolvê-las à fila e consultar o histórico de movimentações e o tempo em cada etapa.

## Requisitos

- Node.js 20.19+ ou 22.12+
- MySQL 8+

## Configuração

1. Crie o banco e as tabelas executando `backend/schema.sql` no MySQL.
2. Copie `backend/.env.example` para `backend/.env` e ajuste as credenciais do banco. Em desenvolvimento, `SESSION_SECRET` é opcional; se omitido, a API gera uma chave temporária e as sessões deixam de valer ao reiniciar o servidor.
3. Na raiz do projeto, instale as dependências:

   ```sh
   npm install
   ```

4. Inicie a API e o frontend:

   ```sh
   npm run dev
   ```

O frontend abre na porta indicada pelo Vite (normalmente `http://localhost:5173`) e a API em `http://localhost:3001`. Em desenvolvimento, a API permite portas locais do Vite entre 5173 e 5199; em produção, configure a origem exata em `FRONTEND_ORIGIN`. O login está temporariamente aberto: qualquer usuário e senha não vazios dão acesso. Isso não deve ser usado em produção ou em uma instância exposta à internet.

Para testar somente a interface sem conectar o MySQL, defina `VITE_LOCAL_MODE=true` em `frontend/.env.local` e reinicie o Vite. Nesse modo, tarefas, encaminhamentos, comentários, histórico e registros de acesso aos detalhes ficam salvos no armazenamento local do navegador; o registro de acesso não identifica a pessoa e anexos continuam exigindo a API e o banco. Esses dados não são compartilhados entre navegadores ou computadores.

Em ambiente de desenvolvimento, entre com o usuário `admin` para exibir a aba **Gerenciar perfis**. O painel permite criar, editar, ativar e desativar perfis de teste. No modo local, as alterações ficam no navegador; com a API conectada, ficam no MySQL. O login temporário aceita qualquer senha não vazia, portanto esse acesso administrativo é exclusivamente para testes e fica desabilitado quando `NODE_ENV=production`. Perfis não possuem senha própria.

## API

- `GET /api/health` — estado da API e da conexão MySQL
- `POST /api/auth/login` — acesso temporário com qualquer usuário e senha não vazios; retorna um token de sessão válido por 8 horas
- `GET /api/members` — pessoas disponíveis para encaminhamento
- `GET /api/admin/members` — listar perfis (administrador de teste)
- `POST /api/admin/members` — criar perfil (administrador de teste)
- `PATCH /api/admin/members/:id` — atualizar ou ativar/desativar perfil (administrador de teste)
- `GET /api/tasks` — tarefas e responsável atual
- `POST /api/tasks` — criação de tarefa
- `POST /api/tasks/:id/forward` — encaminhamento para outra pessoa
- `POST /api/tasks/:id/return` — devolução para a fila
- `POST /api/tasks/:id/complete` — conclusão de tarefa em andamento
- `POST /api/tasks/:id/reopen` — reabertura para o responsável anterior (administrador de teste)
- `GET /api/tasks/:id/history` — histórico completo de encaminhamentos, devoluções e conclusões, além de comentários e lista de anexos
- `POST /api/tasks/:id/comments` — comentário da tarefa
- `POST /api/tasks/:id/attachments` — upload multipart de anexo (máximo de 5 MB)
- `GET /api/tasks/:taskId/attachments/:attachmentId` — download protegido de anexo

Exceto pelo login e pela verificação de saúde, os endpoints exigem um token de sessão no cabeçalho `Authorization: Bearer <token>`. O quadro permite arrastar cartões entre as etapas; a tela de consulta é separada e mostra responsável, etapa, início e duração atual. A preferência de tema claro/escuro é guardada no navegador.

O tempo atual é calculado a partir de `current_since`; cada encaminhamento, devolução, conclusão ou reabertura preserva o evento anterior no histórico. Para bancos existentes, aplique `backend/migrations/20261029_task_reopen.sql` no MySQL para habilitar o registro de reaberturas.

Prazos vencidos e com vencimento próximo são destacados no quadro, na consulta e nos detalhes da tarefa. Comentários e anexos registram o usuário autenticado, mesmo quando ele entrou com login genérico sem cadastro de membro. Para bancos existentes que já têm as tabelas `task_comments` e `task_attachments` da versão anterior, aplique uma vez `backend/migrations/20261029_task_collaboration.sql` no MySQL. Para bancos sem essas tabelas, execute `backend/schema.sql`, que cria a estrutura atualizada.

## Identidade visual

O sistema usa azul institucional, amarelo de destaque e verde para indicadores, com superfícies neutras nos temas claro e escuro. SF Pro é priorizada nos dispositivos Apple quando instalada; nos demais sistemas, a fonte Inter variável é incluída no frontend para manter a tipografia consistente sem depender de instalação local.
