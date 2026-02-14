FROM denoland/deno:2.1.4

WORKDIR /app

COPY deno.json deno.lock* ./
RUN deno install

COPY . .
RUN deno cache main.ts

EXPOSE 8000

CMD ["deno", "run", "-A", "--unstable-kv", "main.ts"]
