FROM registry.access.redhat.com/ubi10/nodejs-24-minimal:10.1-1766060610 AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm i -g corepack@0.31.0 && corepack enable

# change home directory to be at /opt/app-root
ENV HOME=/opt/app-root

# copy the application files to the /opt/app-root/extension-source directory
WORKDIR /opt/app-root/extension-source
RUN mkdir -p /opt/app-root/extension-source

COPY --chown=1001:root . /opt/app-root/extension-source

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM scratch

COPY --from=builder /opt/app-root/extension-source/packages/backend/dist/ /extension/dist
COPY --from=builder /opt/app-root/extension-source/packages/backend/package.json /extension/
COPY --from=builder /opt/app-root/extension-source/LICENSE /extension/
COPY --from=builder /opt/app-root/extension-source/packages/backend/icon.png /extension/
COPY --from=builder /opt/app-root/extension-source/packages/backend/syft.png /extension/
COPY --from=builder /opt/app-root/extension-source/README.md /extension/

LABEL org.opencontainers.image.title="Grype Extension" \
        org.opencontainers.image.description="Grype Extension" \
        org.opencontainers.image.vendor="podman-desktop" \
        io.podman-desktop.api.version=">= 1.25.0"
