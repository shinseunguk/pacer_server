# syntax=docker/dockerfile:1

# --- build ---------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# --- runtime -------------------------------------------------------------
FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# 운영 의존성만 설치해 이미지와 공격 표면을 줄인다.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# 컨테이너를 root로 돌리지 않는다.
USER node

EXPOSE 3000

# 헬스체크는 DB·Redis 연결까지 확인한다.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/v1/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main"]
