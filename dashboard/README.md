# 服务工作台

这是一个完整的前后端统一工作台示例，用后端代理访问最终 Web 服务，再由前端在同源 `iframe` 中展示代理后的页面。适合浏览器无法直接访问内网服务，但运行工作台的后端可以访问这些服务的场景。

## 功能

- 后端读取 `config/services.json` 中的服务列表。
- 前端可以新增、编辑、删除服务配置。
- 前端支持多标签页打开服务，并在页面内切换不同服务界面。
- 服务页面通过 `/proxy/:serviceId/` 由后端反向代理访问。
- 代理会移除常见禁止嵌入的响应头，并处理重定向、Cookie Path、部分 HTML/CSS/JS 里的绝对路径。
- 支持 WebSocket 代理透传。

## 运行

```bash
npm install
npm start
```

默认地址：

```text
http://localhost:3000
```

可以用环境变量改端口：

```bash
$env:PORT=8080; npm start
```

## 配置服务

编辑 `config/services.json`：

```json
[
  {
    "id": "grafana",
    "name": "Grafana",
    "url": "http://10.0.0.12:3000",
    "description": "监控面板",
    "enabled": true
  }
]
```

`url` 必须是后端能够访问的 `http://` 或 `https://` 地址。浏览器只访问工作台自己的地址，不需要能直连这个 `url`。

## 注意

通用反向代理可以覆盖大多数传统 Web 页面，但复杂单页应用如果强依赖固定根路径、严格 CSP、特殊登录跳转或跨域回调，可能还需要在目标服务上配置 base path，或为该服务单独增加更精确的路径重写规则。
