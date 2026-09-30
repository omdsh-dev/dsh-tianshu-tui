/**
 * preset-join 真实装配：0.2.0 预设架构（dsh-agent-preset-registry 花名册 +
 * dsh-agent-preset 声明行）下，create/setup 挂载后 composedPreset === 'standard'，
 * 经 TUI /session new 的新会话同样 join 到 standard。不依赖 CLI 注入的
 * shipped 根——测试自备声明式空 composition（plugins: [] 合法），只钉
 * join/mount 接线。
 *
 * 0.2.0 适配注记：
 * - dsh-agent-presets（临时目录 + agent.cordis.yml + config.roots）不存在了。
 *   替代：registry（Config { default, selectedDefault? }，inject
 *   ["loader", "sessionProjections"]）+ 每个预设一行 dsh-agent-preset
 *   （Config { id, name?, description?, order?, plugins }）。registry 继承
 *   TypertRemoteService，但构造只需 loader/sessionProjections——mount 时经
 *   scopeOf(agentCtx) 绑定，agent ctx 由 agent-loop 铸 scope。
 * - dsh-settings-file / dsh-agent-spine-demo 均不存在了；settings 是 TUI 的
 *   可选服务（未注册即跳过等待），sessions/agents 由 dsh-session /
 *   dsh-agent / dsh-agent-loop 直接提供。
 * - 夹具 session.jsonl 头部按当前线上格式：version 4（物理 v2 框架 +
 *   delegationDepth 必填）。
 */
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import type { ReadStream, WriteStream } from 'node:tty'
import CredentialsLocal from '@deepseek-ai/dsh-credentials-local'
import UserApproval from '@deepseek-ai/dsh-user-approval'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import Llm from '@deepseek-ai/dsh-llm'
import * as LlmReplay from '@deepseek-ai/dsh-llm-replay'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjection from '@deepseek-ai/dsh-session-projection'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import AgentDefaultModel from '@deepseek-ai/dsh-agent-default-model'
import Subagent from '@deepseek-ai/dsh-subagent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentPresetRegistry from '@deepseek-ai/dsh-agent-preset-registry'
import AgentPreset from '@deepseek-ai/dsh-agent-preset'
import * as Tui from '../src/index.js'
import { joinPreset, presetJoinFacet } from '../src/adapter/preset-join.js'

function makeStdout(): { stream: WriteStream; text(): string } {
  const chunks: string[] = []
  const emitter = new EventEmitter()
  const stream = Object.assign(emitter, {
    columns: 100,
    rows: 30,
    isTTY: true,
    write: (chunk: string | Uint8Array): boolean => {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
      return true
    },
  }) as unknown as WriteStream
  return { stream, text: () => chunks.join('') }
}

function makeStdin(): { stream: ReadStream } {
  const emitter = new EventEmitter()
  const stream = Object.assign(emitter, {
    isTTY: true,
    setRawMode: (): ReadStream => stream,
    resume: (): void => {},
    pause: (): void => {},
    setEncoding: (): void => {},
    isPaused: (): boolean => false,
    isRaw: false,
  }) as unknown as ReadStream
  return { stream }
}

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  vi.unstubAllEnvs()
})

describe('preset-join real composition', () => {
  it('create/setup 与 /session new 的新会话 composedPreset 均为 standard', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-tui-preset-join-'))
    vi.stubEnv('DSH_HOME', join(root, '.dsh'))
    vi.stubEnv('DSH_AGENTS_HOME', join(root, '.agents'))

    const fixturePath = join(root, 'session.jsonl')
    await writeFile(fixturePath, [
      JSON.stringify({ type: 'session', version: 4, id: 'pj-s1', createdAt: 0, isSeeded: false, delegationDepth: 0 }),
    ].join('\n') + '\n')

    const stdout = makeStdout()
    const stdin = makeStdin()
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      // settings 缺席：dsh-settings 需要 profileContext（真实 profile 启动才有），
      // 组合测试激活不了；TUI 对未注册服务跳过等待（waitForServicesReady）。
      '- id: credentials',
      "  name: '@deepseek-ai/dsh-credentials-local'",
      '- id: user-approval',
      "  name: '@deepseek-ai/dsh-user-approval'",
      '- id: user-questions',
      "  name: '@deepseek-ai/dsh-user-questions'",
      '- id: llm',
      "  name: '@deepseek-ai/dsh-llm'",
      '- id: llm-replay',
      "  name: '@deepseek-ai/dsh-llm-replay'",
      '  config:',
      `    file: ${JSON.stringify(fixturePath)}`,
      '    providers:',
      '      - id: deepseek-official',
      '        models:',
      '          - id: deepseek-v4-flash',
      '            contextWindow: 128000',
      '- id: sessions',
      "  name: '@deepseek-ai/dsh-session'",
      '- id: session-projections',
      "  name: '@deepseek-ai/dsh-session-projection'",
      '- id: agents',
      "  name: '@deepseek-ai/dsh-agent'",
      '- id: system-prompt',
      "  name: '@deepseek-ai/dsh-system-prompt'",
      '- id: tools',
      "  name: '@deepseek-ai/dsh-tools'",
      '- id: agent-default-model',
      "  name: '@deepseek-ai/dsh-agent-default-model'",
      '  config:',
      '    provider: deepseek-official',
      '    model: deepseek-v4-flash',
      '- id: subagent',
      "  name: '@deepseek-ai/dsh-subagent'",
      '- id: agent-loop',
      "  name: '@deepseek-ai/dsh-agent-loop'",
      // 0.2.0 声明式预设：花名册（default 指认）+ 一行预设声明（空插件列表合法）。
      '- id: agent-presets',
      "  name: '@deepseek-ai/dsh-agent-preset-registry'",
      '  config:',
      '    default: standard',
      '- id: preset-standard',
      "  name: '@deepseek-ai/dsh-agent-preset'",
      '  config:',
      '    id: standard',
      '    plugins: []',
      '- id: tui-runner',
      "  name: '@huiliyi37/dsh-tianshu-tui'",
      '',
    ].join('\n'))

    const wrappedTui: typeof Tui = {
      ...Tui,
      apply: (ctx, config) => {
        Tui.apply(ctx, { ...config, disableKeyAutoPrompt: true, stdin: stdin.stream, stdout: stdout.stream })
      },
    }
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-credentials-local', CredentialsLocal],
      ['@deepseek-ai/dsh-user-approval', UserApproval],
      ['@deepseek-ai/dsh-user-questions', UserQuestions],
      ['@deepseek-ai/dsh-llm', Llm],
      ['@deepseek-ai/dsh-llm-replay', LlmReplay],
      ['@deepseek-ai/dsh-session', SessionStore],
      ['@deepseek-ai/dsh-session-projection', SessionProjection],
      ['@deepseek-ai/dsh-agent', AgentRegistry],
      ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
      ['@deepseek-ai/dsh-tools', Tools],
      ['@deepseek-ai/dsh-agent-default-model', AgentDefaultModel],
      ['@deepseek-ai/dsh-subagent', Subagent],
      ['@deepseek-ai/dsh-agent-loop', AgentLoop],
      ['@deepseek-ai/dsh-agent-preset-registry', AgentPresetRegistry],
      ['@deepseek-ai/dsh-agent-preset', AgentPreset],
      ['@huiliyi37/dsh-tianshu-tui', wrappedTui],
    ])

    const ctx = new Context()
    context = ctx
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()

    await vi.waitFor(() => {
      expect(stdout.text()).toContain('📁')
    }, { timeout: 10_000 })

    const roster = ctx.reflect.get('agentPresets', false) as {
      composedPreset?(agentCtx: unknown): string | undefined
    } | undefined
    expect(roster?.composedPreset).toBeTypeOf('function')

    // 0.2.0 不再预铸 main agent（attach 的 newSession 已 join）；直接 create
    // 走显式 setup mount，验证 joinPreset 接线本身。
    const created = await ctx.agents.create({
      sessionId: SessionId('session-preset-join'),
      meta: { cwd: root },
      agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      setup: async (agentCtx) => {
        await joinPreset({
          facet: presetJoinFacet(ctx),
          agentCtx,
          mode: 'create',
          preferredId: 'standard',
        })
      },
    })
    expect(roster!.composedPreset!(created.agent.ctx)).toBe('standard')

    const before = new Set(ctx.sessions.list().map(s => String(s.id)))
    stdin.stream.emit('data', '/session new')
    stdin.stream.emit('data', '\r')
    await vi.waitFor(() => {
      const added = ctx.sessions.list().map(s => s.id).filter(id => !before.has(String(id)))
      expect(added.length).toBeGreaterThan(0)
      const agent = ctx.agents.get(added[added.length - 1]!)
      expect(agent).toBeDefined()
      expect(roster!.composedPreset!(agent!.ctx)).toBe('standard')
    }, { timeout: 10_000 })
  }, 30_000)
})
