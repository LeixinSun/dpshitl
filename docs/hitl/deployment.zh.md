# 部署专家 Web 实例

[English](deployment.md) | 中文

运维如何为人类专家把 `dsh web` 架起来：服务器持有模型 API Key 并钉死模型，浏览器里没有账户、没有登录、没有 Key 输入框。专家打开一个网址就能和系统对话，凭证的事一概不归他们管。

本页讲凭证与组合。网络那一段——反向代理、公开地址、TLS、可信主机——由[公开部署](../user/guide/public-deployments.zh.md)负责；DeepSeek 之外的模型供应商由[供应商](../user/guide/providers.zh.md)负责。

## 专家看到什么

应用下面的 overlay 之后，浏览器里完全没有账户相关界面：没有登录、左下角没有账户入口（设置入口回退成一个普通的「设置」按钮）、没有账户设置分区、没有首次进入的凭证步骤。模型设置页仍然存在，而且仍然可以编辑 Key——见[本方案没有隐藏什么](#what-this-does-not-hide)。

## 1. 把 Key 交给 Host

`DEEPSEEK_API_KEY` 是 DeepSeek 路由解析的凭证引用。四个层级按以下顺序回答它：

| 顺序 | 来源 | 说明 |
|---|---|---|
| 1 | `$DSH_HOME/.credentials.yaml` 的 `refs:` | 凭证存储，见下文 |
| 2 | 启动进程的环境变量 | systemd unit 或容器环境所设 |
| 3 | `<启动时的工作目录>/.env` | 服务器启动所在目录 |
| 4 | `$DSH_HOME/.env` | 按安装实例的默认值 |

任何一层给了就够；环境变量里有 Key 时并不需要凭证存储。

服务器上，要么在 service unit 里导出：

```sh
DSH_HOME=/srv/dsh DEEPSEEK_API_KEY=sk-... dsh web --host 10.0.0.5 --port 3080
```

要么写 `$DSH_HOME/.env`：

```sh
DEEPSEEK_API_KEY=sk-...
```

要么写 `$DSH_HOME/.credentials.yaml` 这个凭证存储：

```yaml
version: 1
refs:
  DEEPSEEK_API_KEY: sk-...
```

**存储文件的权限必须是 `0600`。** 只要带上 group 或 other 的任一权限位，Host 就会拒绝启动，并指明文件和需要执行的 `chmod 600`。该文件被监听，外部修改无需重启即可生效。没有任何 CLI 子命令可以写入 Key，服务器侧就这三条路。

`DEEPSEEK_BASE_URL` 把路由指向别的端点。它属于 bootstrap 名字，**必须在启动环境里导出**——写在任何 `.env` 文件里都会在启动时显式报错，而不是被悄悄忽略。`DSH_HOME` 同理。

## 2. 钉死模型

`agent-default-model` 决定新建 Session 跑在什么模型上。在 overlay 里设定它，意味着专家不必选模型，也没人能在这个部署不付费的模型上开 Session。

## 3. 应用部署 overlay

[`deploy/expert-web.overlay.yml`](../../deploy/expert-web.overlay.yml) 关掉账户 UI 行并钉死默认模型：

```sh
dsh web --patch /path/to/expert-web.overlay.yml --no-open
```

`--patch` 是启动器参数，必须排在应用自身的参数前面；`dsh web --no-open --patch <文件>` 会被拒绝。

overlay 是做部署选择的受支持方式：它叠加在已发布的 bundle 之上而不修改它们，所以升级之后选择仍然保留。等价的永久位置是 `$DSH_HOME/profiles/web/cordis.patch.yml`，该安装实例上的每一次 `dsh web` 都会应用它，不需要加参数。

改动上线之前，先看它实际组合成什么：

```sh
dsh --profile web --dump-config --patch /path/to/expert-web.overlay.yml
```

home patch 和命令行 overlay 还**优先于设置表单的写入**：它们设定的值无法从界面改掉，写入会被拒绝而不是悄悄丢失。这正是「钉死的模型」成为约束而非默认值的原因。

## 4. 决定谁能打开

`dsh web` 打印的网址带一个启动 token；打开它会把 token 换成一个签名 cookie，之后每次调用都用它鉴权。这是一个**单所有者模型**——没有账号体系，而且所有者这个身份会绕过所有远程访问检查。把打印出来的网址当作它本来的身份：一份凭证。

因此，面向多个具名专家的访问控制不是这个实例提供的能力。把它放到反向代理上，或者给每位专家一个独立实例、各自独立的 `DSH_HOME`。独立的 `DSH_HOME` 同时也是让不同读者之间的 Session 与附件存储互相隔离的办法。

<a id="what-this-does-not-hide"></a>
## 本方案没有隐藏什么

对专家要如实说明还剩下哪些口子：

- **模型设置页仍然能编辑 Key。** `ui-settings-models` 没有隐藏 Key 字段的开关，而 overlay 保留了这个页面以便模型列表继续可用。专家打开「设置」就能够到它。要隐藏就得把 Models 这一行整个卸掉，同时也会失去模型选择——取舍由你定。
- **Host 侧的账户管道仍在。** overlay 去掉的是浏览器界面，不是 `account-controller` 这个 Remote。客户端行被关掉之后，没有任何东西会调用它。
- **启动 token 是唯一的闸门。** 拿到网址的人就是所有者。

## 验证结果

带 overlay 启动之后：

1. 左下角是一个普通的「设置」按钮，不是账户行。
2. 首次加载不弹登录或 API Key 对话框。
3. `dsh --profile web --dump-config --patch <文件>` 显示 `ui-settings-account` 带着 `disabled: true`，`agent-default-model` 带着你配置的 provider 和 model。
4. 新建一个 Session 并让它回答一句，证明 Key 已解析成功。失败时 Host 会指明它查过哪一层。
