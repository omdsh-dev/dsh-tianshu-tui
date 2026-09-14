/**
 * assistant 流语义层单测。
 *
 * 覆盖两种真实记录形态：压缩 run（宿主 AssistantStreamAccumulator 落盘的主流
 * 形态——text-chunks / reasoning-chunks）与原始 chunk（即时完成的单条 delta）。
 * 此前 TUI 各消费点的测试只构造过原始 chunk，压缩形态未被覆盖。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/tests/assistant-stream
 */

import { describe, expect, it } from 'vitest'
import type { AssistantStreamRecord, ContentBlock } from '@deepseek-ai/dsh-llm'
import { assistantDeltas, foldAssistantStream, foldMessageContent } from '../src/adapter/assistant-stream.js'

/** 压缩正文 run：texts 逐条展开成 text-delta，dt[i] 是第 i+1 条相对前一条的毫秒增量。 */
function textRun(time0: number, texts: readonly string[]): AssistantStreamRecord {
  return { type: 'text-chunks', time0, index: 0, dt: texts.slice(1).map(() => 10), texts }
}

/** 压缩推理 run。 */
function reasoningRun(time0: number, texts: readonly string[]): AssistantStreamRecord {
  return { type: 'reasoning-chunks', time0, index: 0, dt: texts.slice(1).map(() => 10), texts }
}

/** 原始单 chunk 记录。 */
function rawChunk(time: number, chunk: Record<string, unknown>): AssistantStreamRecord {
  return { type: 'chunk', time, chunk } as unknown as AssistantStreamRecord
}

describe('assistantDeltas', () => {
  it('展开压缩 text-chunks / reasoning-chunks 为分轨增量（保留时间戳）', () => {
    const deltas = assistantDeltas([
      reasoningRun(100, ['想', '一下']),
      textRun(200, ['答', '案']),
    ])
    expect(deltas).toEqual([
      { kind: 'reasoning', text: '想', time: 100 },
      { kind: 'reasoning', text: '一下', time: 110 },
      { kind: 'text', text: '答', time: 200 },
      { kind: 'text', text: '案', time: 210 },
    ])
  })

  it('展开原始 chunk 记录', () => {
    const deltas = assistantDeltas([
      rawChunk(1, { type: 'text-delta', text: '正' }),
      rawChunk(2, { type: 'reasoning-delta', text: '推' }),
    ])
    expect(deltas).toEqual([
      { kind: 'text', text: '正', time: 1 },
      { kind: 'reasoning', text: '推', time: 2 },
    ])
  })

  it('增量顺序与记录顺序一致（推理与正文可交错）', () => {
    const deltas = assistantDeltas([
      textRun(1, ['A']),
      reasoningRun(2, ['B']),
      textRun(3, ['C']),
    ])
    expect(deltas.map(d => `${d.kind}:${d.text}`)).toEqual(['text:A', 'reasoning:B', 'text:C'])
  })

  it('空流返回空序列', () => {
    expect(assistantDeltas([])).toEqual([])
  })
})

describe('foldAssistantStream', () => {
  it('正文与推理分轨拼接，不混进同一串', () => {
    const folded = foldAssistantStream([
      reasoningRun(1, ['草稿', '流']),
      textRun(2, ['最终', '答案']),
    ])
    expect(folded).toEqual({ text: '最终答案', reasoning: '草稿流' })
  })

  it('只有推理时 text 为空', () => {
    expect(foldAssistantStream([reasoningRun(1, ['想'])]).text).toBe('')
  })

  it('空流返回双空串', () => {
    expect(foldAssistantStream([])).toEqual({ text: '', reasoning: '' })
  })
})

describe('foldMessageContent', () => {
  it('抽 text / reasoning 块，忽略其他块类型', () => {
    const content = [
      { type: 'reasoning', text: '思考' },
      { type: 'text', text: '正文' },
      { type: 'tool-call', id: 'c1', name: 'bash', arguments: '{}' },
      { type: 'text', text: '续' },
    ] as unknown as readonly ContentBlock[]
    expect(foldMessageContent(content)).toEqual({ text: '正文续', reasoning: '思考' })
  })

  it('与压缩流路径同口径（分轨）', () => {
    // 同一内容经两条路径读取应得到相同结果——这是共享层存在的意义。
    const viaContent = foldMessageContent([
      { type: 'reasoning', text: 'R' },
      { type: 'text', text: 'T' },
    ] as unknown as readonly ContentBlock[])
    const viaStream = foldAssistantStream([reasoningRun(1, ['R']), textRun(2, ['T'])])
    expect(viaContent).toEqual(viaStream)
  })

  it('空内容返回双空串', () => {
    expect(foldMessageContent([])).toEqual({ text: '', reasoning: '' })
  })
})
