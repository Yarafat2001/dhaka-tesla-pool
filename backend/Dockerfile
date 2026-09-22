FROM node:20-slim

WORKDIR /app

# openssl is required by Prisma's query engine on Debian-based images
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed && npm start"]
