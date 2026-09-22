FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# Copied in full (not just package.json) because `npm install`'s postinstall
# hook compiles it — it needs the actual source to be there already.
COPY packages/shared packages/shared
COPY packages/backend/package.json packages/backend/package.json
RUN npm install
COPY packages/backend packages/backend
RUN npm run build --workspace packages/backend

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/packages/backend/package.json packages/backend/package.json
COPY --from=build /app/packages/backend/dist packages/backend/dist
COPY --from=build /app/packages/backend/data packages/backend/data
WORKDIR /app/packages/backend
EXPOSE 4000
CMD ["node", "dist/index.js"]
