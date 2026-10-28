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

## API

- `GET /api/health` — estado da API e da conexão MySQL
- `POST /api/auth/login` — acesso temporário com qualquer usuário e senha não vazios; retorna um token de sessão válido por 8 horas
- `GET /api/members` — pessoas disponíveis para encaminhamento
- `GET /api/tasks` — tarefas e responsável atual
- `POST /api/tasks` — criação de tarefa
- `POST /api/tasks/:id/forward` — encaminhamento para outra pessoa
- `POST /api/tasks/:id/return` — devolução para a fila
- `POST /api/tasks/:id/complete` — conclusão de tarefa em andamento
- `GET /api/tasks/:id/history` — histórico cronológico da tarefa e duração das etapas

Exceto pelo login e pela verificação de saúde, os endpoints exigem um token de sessão no cabeçalho `Authorization: Bearer <token>`. O quadro permite arrastar cartões entre as etapas; a tela de consulta é separada e mostra responsável, etapa, início e duração atual. A preferência de tema claro/escuro é guardada no navegador.

O tempo atual é calculado a partir de `current_since`; cada encaminhamento, devolução ou conclusão preserva o evento anterior no histórico. Se o schema já foi instalado antes dessa atualização, aplique `ALTER TABLE task_history MODIFY action ENUM('created', 'forwarded', 'returned', 'completed') NOT NULL;` no MySQL.

## Identidade visual

O sistema usa azul institucional, amarelo de destaque e verde para indicadores, com superfícies neutras nos temas claro e escuro. SF Pro é priorizada nos dispositivos Apple quando instalada; nos demais sistemas, a fonte Inter variável é incluída no frontend para manter a tipografia consistente sem depender de instalação local.
