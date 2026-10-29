export const config = {
  mongoUri: process.env.MONGODB_URI ?? "mongodb://localhost:27018/sumi?replicaSet=rs0&directConnection=true",
  port: Number(process.env.PORT ?? 3000),
};
