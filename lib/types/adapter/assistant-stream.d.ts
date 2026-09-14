/**
 * TUI 视角的 assistant 流语义层。
 *
 * 宿主 0.1.5 的助手正文有两条落盘路径：正常成功回合落 `assistant/message`
 * （正文在 message.content + 内嵌精确流），失败/中断/重试回合落
 * `assistant/attempt`（正文在压缩流记录）。两条路径的读取语义——展开压缩流、
 * 正文与推理分轨、从内容块抽取——此前散在 transcript 折叠 / app 实时渲染 /
 * btw 答案收集 / export 转录四处各自实现，同一宿主行为变更需四处联动改动
 * （rc.30 的 chunk→attempt 改批就漏改过，修复也各写一版）。本模块是唯一实现。
 *
 * @module @deepseek-ai/dsh-tianshu-tui/adapter/assistant-stream
 */
import type { AssistantStreamRecord, ContentBlock } from '@deepseek-ai/dsh-llm';
/** 展开后的一个增量：正文或推理，保留宿主原始时间戳。 */
export interface AssistantDelta {
    /** 通道：正文（渲染为答案）或推理（进思考通道）。 */
    readonly kind: 'text' | 'reasoning';
    /** 该增量的文本片段。 */
    readonly text: string;
    /** 宿主 Session 事件时间（Unix epoch ms）；实时渲染取首条推理的时间作段起点。 */
    readonly time: number;
}
/**
 * 展开压缩流为有序增量序列（正文/推理分轨，保留时间戳）。
 * text-delta / reasoning-delta 之外的 chunk（block / usage / finish）不产生增量。
 * @param stream - 一次 durable Assistant 结算的压缩流记录。
 * @returns 按记录顺序的增量序列。
 */
export declare function assistantDeltas(stream: readonly AssistantStreamRecord[]): readonly AssistantDelta[];
/**
 * 分轨拼接压缩流。正文与推理必须分开累积——混在一起会把模型的草稿流泄漏进
 * 渲染的答案（两条通道在渲染层是不同区域，消费方各取所需）。
 * @param stream - 一次 durable Assistant 结算的压缩流记录。
 */
export declare function foldAssistantStream(stream: readonly AssistantStreamRecord[]): {
    text: string;
    reasoning: string;
};
/**
 * 从消息内容块抽正文与推理（`assistant/message` 的 message.content 路径），
 * 与压缩流路径同口径分轨。text / reasoning 之外的块（tool-call 等）不参与。
 * @param content - 一条助手消息的内容块序列。
 */
export declare function foldMessageContent(content: readonly ContentBlock[]): {
    text: string;
    reasoning: string;
};
