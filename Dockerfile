# syntax=docker/dockerfile:1
# One image, one origin (D38): the SPA build is served by the server from SANTI_WEB_DIR.
# No BuildKit cache mounts: Railway's builder rejects cache ids without its service prefix.

FROM node:24-trixie-slim@sha256:a6155384446670e9719bdc4fd0ebe4d4b29fb32a8d6aa523da3547a6cfbcf22c AS web
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

FROM rust:slim-trixie@sha256:00544ccc9431a2fe93e65185d21381b0a039342f5cefcf84fbddac273c9e573d AS server
WORKDIR /src
ENV SQLX_OFFLINE=true CARGO_PROFILE_RELEASE_STRIP=true
COPY . .
RUN cargo build --release --locked -p santi-server --bin santi-server \
    && cp target/release/santi-server /santi-server \
    && mkdir -p /data/attachments

# Static busybox gives the distroless image a wget for the healthcheck.
FROM busybox:1.37-musl@sha256:5cec3fc171c87218698e85a52af7087de727372aae264a787b8112901a5b0092 AS busybox

FROM gcr.io/distroless/cc-debian13:nonroot@sha256:b7e81cb1af38d9345680e68bcf564d388f96304e25222030fc8c051faf8565b3
COPY --from=busybox /bin/busybox /usr/local/bin/wget
COPY --from=server /santi-server /usr/local/bin/santi-server
COPY --from=web /web/dist /srv/santi/web
# Attachments on local disk (D53) when no SANTI_S3_* bucket is set; 65532 is distroless's nonroot.
COPY --from=server --chown=65532:65532 /data /data
ENV SANTI_ADDR=0.0.0.0:8080 SANTI_WEB_DIR=/srv/santi/web SANTI_ATTACHMENTS_DIR=/data/attachments
USER nonroot
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
    CMD ["/usr/local/bin/wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/health"]
ENTRYPOINT ["/usr/local/bin/santi-server"]
