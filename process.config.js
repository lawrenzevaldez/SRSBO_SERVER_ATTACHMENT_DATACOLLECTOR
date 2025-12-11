module.exports = {
    apps : [{
    name: "srs_bo",
    script: "./server.js",
    env: {
    NODE_ENV: "development",
    },
    env_production: {
    NODE_ENV: "production",
    }
}]
}