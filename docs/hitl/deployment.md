# Deploying the expert web instance

English | [中文](deployment.zh.md)

How an operator stands up `dsh web` for human experts: the server holds the provider key and pins the model, and the browser offers no account, no sign-in, and no key field. Experts open a URL and talk to the system; nothing about credentials is theirs to manage.

This page covers credentials and composition. The network leg — reverse proxy, public URL, TLS, trusted hosts — is owned by [public deployments](../user/guide/public-deployments.md); provider options beyond DeepSeek are owned by [providers](../user/guide/providers.md).

## What the expert sees

With the overlay below applied, the browser has no account surface at all: no sign-in, no account menu in the bottom-left corner (the settings launcher falls back to its plain Settings button), no Account settings section, and no first-run credential step. The Models settings page still exists and can still edit a key — see [What this does not hide](#what-this-does-not-hide).

## 1. Give the Host a key

`DEEPSEEK_API_KEY` is the credential reference the DeepSeek route resolves. Four layers answer it, in this order:

| Order | Source | Notes |
|---|---|---|
| 1 | `$DSH_HOME/.credentials.yaml`, under `refs:` | The stored credential; see below |
| 2 | The launching process environment | What a systemd unit or container env sets |
| 3 | `<invocation cwd>/.env` | The working directory the server starts in |
| 4 | `$DSH_HOME/.env` | Per-installation default |

Any one of them is enough; the credential store is not required when the environment carries the key.

For a server, either export it in the service unit:

```sh
DSH_HOME=/srv/dsh DEEPSEEK_API_KEY=sk-... dsh web --host 10.0.0.5 --port 3080
```

or write `$DSH_HOME/.env`:

```sh
DEEPSEEK_API_KEY=sk-...
```

or write the credential store at `$DSH_HOME/.credentials.yaml`:

```yaml
version: 1
refs:
  DEEPSEEK_API_KEY: sk-...
```

**The store file must be mode `0600`.** Any group or other permission bit makes the Host refuse to start, naming the file and the required `chmod 600`. The file is watched, so an external edit takes effect without a restart. There is no CLI subcommand that writes a key; these three routes are the whole server-side surface.

`DEEPSEEK_BASE_URL` points the route at a different endpoint. It is a bootstrap name, so **it must be exported in the launching environment** — setting it in any `.env` file fails loudly at startup rather than being silently ignored. `DSH_HOME` has the same rule.

## 2. Pin the model

`agent-default-model` decides what a newly created Session runs on. Setting it in the overlay means no expert has to choose a model, and no one can start a Session on a model this deployment does not pay for.

## 3. Apply the deployment overlay

[`deploy/expert-web.overlay.yml`](../../deploy/expert-web.overlay.yml) disables the account UI row and pins the default model:

```sh
dsh web --patch /path/to/expert-web.overlay.yml --no-open
```

`--patch` is a launcher flag, so it precedes the app's own arguments; `dsh web --no-open --patch <file>` is rejected.

An overlay is the supported way to make deployment choices: it layers over the shipped bundles without editing them, so an upgrade keeps the choice. The equivalent permanent home is `$DSH_HOME/profiles/web/cordis.patch.yml`, which the launcher applies to every `dsh web` on that installation without the flag.

Check what a change actually composes to before shipping it:

```sh
dsh --profile web --dump-config --patch /path/to/expert-web.overlay.yml
```

A home patch or a command-line overlay also **wins over a settings-form write**: a value one of them sets cannot be overridden from the UI, and the write is refused rather than silently lost. That is what makes the pinned model a constraint rather than a default.

## 4. Decide who may open it

`dsh web` prints a URL carrying a launch token; opening it exchanges the token for a signed cookie that authenticates every later call. This is a **single-owner model** — there are no accounts, and the owner peer bypasses every remote-access check. Treat the printed URL as the credential it is.

Consequently, access control for several named experts is not something this instance provides. Put it in the reverse proxy, or give each expert their own instance with its own `DSH_HOME`. Separate `DSH_HOME` directories are also what keeps Sessions and the attachment store separate between readers.

## What this does not hide

Be accurate with your experts about the remaining surface:

- **The Models settings page still edits a key.** `ui-settings-models` has no flag that hides the key field, and the overlay leaves the page mounted so the model list keeps working. An expert who opens Settings can reach it. Hiding it would mean unmounting the Models row, which also removes model selection; decide which you want.
- **The Host keeps its account plumbing.** The overlay removes the browser surface, not the `account-controller` Remote. Nothing calls it once the client row is disabled.
- **The launch token is the only gate.** Anyone with the URL is the owner.

## Checking the result

After starting with the overlay:

1. The bottom-left corner shows a plain Settings button, not an account row.
2. No sign-in or API-key dialog appears on first load.
3. `dsh --profile web --dump-config --patch <file>` shows `ui-settings-account` carrying `disabled: true` and `agent-default-model` carrying your provider and model.
4. A new Session answers a prompt, which proves the key resolved. If it fails, the Host names which layer it looked in.
