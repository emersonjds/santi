# syntax=docker/dockerfile:1
# One image, one origin (D38): the SPA build is served by the server from SANTI_WEB_DIR.
# No BuildKit cache mounts: Railway's builder rejects cache ids without its service prefix.

FROM node:24-trixie-slim AS web
WORKDIR /web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
# Public address for the landing page's canonical and social links, robots.txt and sitemap.xml.
ARG VITE_SITE_URL
ARG RAILWAY_PUBLIC_DOMAIN
# Operator details for /privacy and /terms (D45); placeholders when unset, except on Railway
# (RAILWAY_PROJECT_ID set), where a missing name or privacy email fails the build.
# VITE_LEGAL_PAGES=off builds without the pages and the landing's links to them.
ARG RAILWAY_PROJECT_ID
ARG VITE_LEGAL_PAGES
ARG VITE_OPERATOR_NAME
ARG VITE_PRIVACY_EMAIL
ARG VITE_HOSTING_REGION
ARG VITE_LEGAL_VENUE
RUN pnpm build

FROM rust:slim-trixie AS server
WORKDIR /src
ENV SQLX_OFFLINE=true CARGO_PROFILE_RELEASE_STRIP=true
COPY . .
RUN cargo build --release --locked -p santi-server --bin santi-server --bin reset-link \
    && cp target/release/santi-server target/release/reset-link /

# Static busybox gives the distroless image a wget for the healthcheck.
FROM busybox:1.37-musl AS busybox

FROM gcr.io/distroless/cc-debian13:nonroot
COPY --from=busybox /bin/busybox /usr/local/bin/wget
COPY --from=server /santi-server /usr/local/bin/santi-server
COPY --from=server /reset-link /usr/local/bin/reset-link
COPY --from=web /web/dist /srv/santi/web
ENV SANTI_ADDR=0.0.0.0:8080 SANTI_WEB_DIR=/srv/santi/web
USER nonroot
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
    CMD ["/usr/local/bin/wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/health"]
ENTRYPOINT ["/usr/local/bin/santi-server"]
