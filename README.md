# INTVyom Backend

## Environment Variables

Create a local `.env` file (already gitignored) and put all runtime secrets/config there (API keys, Atlas URI, etc.).
This same `.env` is used by Docker Compose via `env_file`.

```env
PORT=3000
MONGO_URI=mongodb+srv://<username>:<password>@<cluster-url>/intvyom?retryWrites=true&w=majority
OPENAI_API_KEY=sk-your-openai-api-key
ELEVENLABS_API_KEY=your-elevenlabs-api-key
```

For Docker Compose:

- It runs only the API service
- It loads variables from `.env` (`env_file: .env`)
- MongoDB should be provided externally (MongoDB Atlas)

## Run With Docker Compose

```bash
docker compose build --no-cache api
docker compose up -d
docker compose ps
docker compose logs -f api
```

If your machine uses legacy Compose, replace `docker compose` with `docker-compose`.

Stop services:

```bash
docker compose down
```

## Run Without Docker

```bash
npm install
npm start
```
