FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Next.js inlines NEXT_PUBLIC_* into the bundle at build time, so the API URL has
# to be present *here*, not at runtime. There are two ways in:
#   1. `frontend/.env` - the compose path (`.env` is deliberately not
#      dockerignored, see .dockerignore).
#   2. `--build-arg NEXT_PUBLIC_API_URL=...` - how Render hands a service's
#      environment variables to a Docker build (render.yaml relies on this).
# The arg is only written to `.env.production` when it is non-empty, which
# `next build` reads at a higher precedence than `.env`. That keeps a plain
# `docker compose build web` behaving exactly as it did before: with no build
# arg, no `.env.production` is created and `frontend/.env` stays in charge.
ARG NEXT_PUBLIC_API_URL
RUN if [ -n "$NEXT_PUBLIC_API_URL" ]; then \
      printf 'NEXT_PUBLIC_API_URL=%s\n' "$NEXT_PUBLIC_API_URL" > .env.production; \
    fi

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
