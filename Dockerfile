# syntax=docker/dockerfile:1
# One image, one origin (D38): the SPA build is served by the server from SANTI_WEB_DIR.

FROM node:24-trixie-slim AS web
WORKDIR /web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=santi-pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM rust:slim-trixie AS server
WORKDIR /src
ENV SQLX_OFFLINE=true CARGO_PROFILE_RELEASE_STRIP=true
COPY . .
RUN --mount=type=cache,id=santi-cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=santi-cargo-target,target=/src/target \
    cargo build --release --locked -p santi-server --bin santi-server \
    && cp target/release/santi-server /santi-server

# Static busybox gives the distroless image a wget for the healthcheck.
FROM busybox:1.37-musl AS busybox

FROM gcr.io/distroless/cc-debian13:nonroot
COPY --from=busybox /bin/busybox /usr/local/bin/wget
COPY --from=server /santi-server /usr/local/bin/santi-server
COPY --from=web /web/dist /srv/santi/web
ENV SANTI_ADDR=0.0.0.0:8080 SANTI_WEB_DIR=/srv/santi/web
USER nonroot
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
    CMD ["/usr/local/bin/wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/health"]
ENTRYPOINT ["/usr/local/bin/santi-server"]
