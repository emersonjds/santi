import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "santi";
export default defineRailway(() => {
  const santi = service("santi", {
    source: github("emersonjds/santi", { branch: "main", checkSuites: false }),
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile", watchPatterns: ["crates/**", "web/**", ".sqlx/**", "Cargo.toml", "Cargo.lock", "Dockerfile"] },
    healthcheck: "/health",
    healthcheckTimeout: 120,
    replicas: { "europe-west4-drams3a": 1 },
    deploy: { limitOverride: { containers: { cpu: 1, memoryBytes: 1000000000 } } },
    domains: ["getsanti.app"],
  });

  return project("loyal-ambition", {
    variables: { managed: false },
    resources: [santi],
  });
});
