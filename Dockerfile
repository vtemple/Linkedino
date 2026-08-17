# Image applicative complète.
#
# Contrairement à une plateforme de fonctions, un conteneur permet d'embarquer
# Chromium et TeX Live — les deux binaires dont dépendent l'export PDF humain
# et l'export PDF ATS. C'est le chemin le plus court vers un déploiement où
# toutes les fonctionnalités marchent.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Chromium pour le PDF humain, TeX Live pour le PDF ATS.
# `--no-install-recommends` évite d'embarquer la distribution TeX complète,
# qui pèserait plusieurs gigaoctets pour rien : le gabarit n'utilise que
# geometry, enumitem, microtype, hyperref et fontenc.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      texlive-latex-base \
      texlive-latex-recommended \
      texlive-fonts-recommended \
      texlive-lang-french \
      lmodern \
      fonts-liberation \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV CHROMIUM_PATH=/usr/bin/chromium

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Stockage des CV et des assets. À monter sur un volume persistant, sans quoi
# les données disparaissent à chaque redéploiement.
VOLUME /app/.data

EXPOSE 3000
CMD ["npm", "run", "start"]
