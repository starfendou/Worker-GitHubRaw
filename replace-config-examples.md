# 动态内容替换配置示例

## 基本用法

### 1. 数据库配置动态替换

```json
[{
  "files": ["/config/app.yml"],
  "mode": "env",
  "api": {
    "url": "https://api.example.com/config/database",
    "headers": {
      "Authorization": "Bearer YOUR_TOKEN"
    }
  },
  "mappings": {
    "database_host": "database.host",
    "database_port": "database.port",
    "database_name": "database.name"
  },
  "cache": 300,
  "onError": "keep"
}]
```

原始文件内容：
```yaml
database:
  host: ${env:database_host}
  port: ${env:database_port}
  name: ${env:database_name}
```

替换后的内容：
```yaml
database:
  host: db.example.com
  port: 5432
  name: myapp_prod
```

### 2. 多文件配置

```json
[{
  "files": [
    "/config/app.yml",
    "/settings/server.conf",
    "/nginx/upstream.conf"
  ],
  "mode": "env",
  "api": {
    "url": "https://api.example.com/infrastructure/active",
    "headers": {
      "Authorization": "Bearer YOUR_TOKEN"
    }
  },
  "mappings": {
    "api_host": "services.api.host",
    "api_port": "services.api.port",
    "cdn_host": "services.cdn.host"
  },
  "cache": 600
}]
```

### 3. 混合静态和动态值

```json
[{
  "files": ["/config/app.yml"],
  "mode": "env",
  "api": {
    "url": "https://api.example.com/config/runtime",
    "headers": {
      "Authorization": "Bearer YOUR_TOKEN"
    }
  },
  "mappings": {
    "api_endpoint": "endpoints.primary",
    "backup_endpoint": "endpoints.backup"
  },
  "static": {
    "version": "1.0.0",
    "environment": "production"
  },
  "cache": 300
}]
```

### 4. 多组规则（不同文件使用不同配置）

```json
[
  {
    "files": ["/config/database.yml"],
    "mode": "env",
    "api": {
      "url": "https://config-api.example.com/database",
      "headers": {"Authorization": "Bearer DB_TOKEN"}
    },
    "mappings": {
      "db_host": "primary.host",
      "db_port": "primary.port"
    },
    "cache": 300
  },
  {
    "files": ["/config/redis.yml"],
    "mode": "env",
    "api": {
      "url": "https://config-api.example.com/cache",
      "headers": {"Authorization": "Bearer CACHE_TOKEN"}
    },
    "mappings": {
      "redis_host": "redis.host",
      "redis_port": "redis.port",
      "redis_password": "redis.password"
    },
    "cache": 600
  },
  {
    "files": ["/version.txt"],
    "mode": "template",
    "static": {
      "version": "2.0.0",
      "build": "2024.01.01"
    }
  }
]
```

### 5. 自定义正则表达式

```json
[{
  "files": ["/config/custom.conf"],
  "mode": "regex",
  "pattern": "#\\{([^}]+)\\}",
  "api": {
    "url": "https://config-api.example.com/values"
  },
  "mappings": {
    "SERVER_HOST": "server.hostname",
    "SERVER_PORT": "server.port"
  }
}]
```

原始内容：
```
server_address=#{SERVER_HOST}:#{SERVER_PORT}
```

### 6. 错误处理策略

```json
[
  {
    "files": ["/config/app.yml"],
    "mode": "env",
    "api": {
      "url": "https://api.example.com/config"
    },
    "mappings": {
      "required_value": "data.value"
    },
    "onError": "error"  // 如果替换失败，返回500错误
  },
  {
    "files": ["/config/optional.yml"],
    "mode": "env",
    "api": {
      "url": "https://api.example.com/optional"
    },
    "mappings": {
      "optional_value": "data.value"
    },
    "onError": "remove"  // 如果替换失败，删除占位符
  }
]
```

### 7. 复杂的JSON路径访问

```json
[{
  "files": ["/config/complex.yml"],
  "mode": "env",
  "api": {
    "url": "https://api.example.com/complex-data"
  },
  "mappings": {
    "primary_api": "services.0.endpoint",
    "backup_api": "services.1.endpoint",
    "primary_db": "databases.primary.host",
    "replica_db": "databases.replicas.0.host",
    "api_key": "credentials.api.key",
    "api_secret": "credentials.api.secret"
  }
}]
```

对应的API响应：
```json
{
  "services": [
    {"endpoint": "api1.example.com", "port": 443},
    {"endpoint": "api2.example.com", "port": 443}
  ],
  "databases": {
    "primary": {"host": "db-master.example.com"},
    "replicas": [
      {"host": "db-replica-1.example.com"},
      {"host": "db-replica-2.example.com"}
    ]
  },
  "credentials": {
    "api": {
      "key": "abc123",
      "secret": "xyz789"
    }
  }
}
```

## 高级用法

### 条件替换（根据环境）

虽然当前实现不直接支持条件判断，但可以通过部署时使用不同的 `REPLACE_CONFIG` 来实现：

开发环境：
```json
[{
  "files": ["/config/app.yml"],
  "mode": "env",
  "static": {
    "api_url": "http://localhost:8080",
    "debug": "true"
  }
}]
```

生产环境：
```json
[{
  "files": ["/config/app.yml"],
  "mode": "env",
  "api": {
    "url": "https://prod-api.example.com/config"
  },
  "mappings": {
    "api_url": "production.api_url",
    "debug": "production.debug_mode"
  }
}]
```

## 实际应用场景

### 1. 微服务配置管理

```json
[{
  "files": ["/config/services.yml"],
  "mode": "env",
  "api": {
    "url": "https://discovery.example.com/services",
    "headers": {"Authorization": "Bearer SERVICE_TOKEN"}
  },
  "mappings": {
    "user_service": "services.user.endpoint",
    "order_service": "services.order.endpoint",
    "payment_service": "services.payment.endpoint"
  },
  "cache": 120
}]
```

### 2. 环境特定配置

```json
[{
  "files": ["/config/environment.yml"],
  "mode": "template",
  "api": {
    "url": "https://config.example.com/environment/{{DEPLOY_ENV}}"
  },
  "mappings": {
    "log_level": "logging.level",
    "feature_flags": "features.enabled"
  },
  "static": {
    "DEPLOY_ENV": "production"
  }
}]
```

### 3. 安全密钥轮换

```json
[{
  "files": ["/config/secrets.yml"],
  "mode": "env",
  "api": {
    "url": "https://vault.example.com/v1/secret/app",
    "headers": {"X-Vault-Token": "YOUR_VAULT_TOKEN"}
  },
  "mappings": {
    "jwt_secret": "data.jwt_secret",
    "encryption_key": "data.encryption_key"
  },
  "cache": 60,
  "onError": "error"
}]
```

## 配置技巧

1. **缓存优化**：对于不常变化的配置，设置较长的缓存时间（如3600秒）
2. **错误处理**：关键配置使用 `"onError": "error"`，可选配置使用 `"onError": "remove"`
3. **文件匹配**：支持完整路径匹配，注意以 `/` 开头
4. **性能考虑**：尽量将相同API的请求合并到一个规则中，避免重复请求

## 在 .dev.vars 中使用

由于JSON包含引号，在 `.dev.vars` 文件中需要使用单引号包裹：

```bash
REPLACE_CONFIG='[{"files":["/config/app.yml"],"mode":"env","api":{"url":"https://api.example.com/config/","headers":{"Authorization":"Bearer YOUR_TOKEN"}},"mappings":{"database_host":"data.database.host","api_key":"data.keys.api"},"cache":300}]'
```

或者使用转义：

```bash
REPLACE_CONFIG="[{\"files\":[\"/config/app.yml\"],\"mode\":\"env\",\"api\":{\"url\":\"https://api.example.com/config/\",\"headers\":{\"Authorization\":\"Bearer YOUR_TOKEN\"}},\"mappings\":{\"database_host\":\"data.database.host\",\"api_key\":\"data.keys.api\"},\"cache\":300}]"
``` 