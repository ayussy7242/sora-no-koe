"use strict";

/**
 * Relation blocks schema (JSDoc types).
 * Blocks are page-agnostic: they do not know page numbers or placements.
 *
 * Renderer layer decides:
 * - which page consumes which block (via page config)
 * - where AI is injected (via slots)
 */

/**
 * @typedef {{ text: string }} TextBlock
 *
 * @typedef {{
 *   key: string,
 *   name: string,
 *   tags?: string[],
 *   evidence?: string[]
 * }} RelationTypeMeta
 *
 * @typedef {{
 *   pattern: RelationTypeMeta,
 *   ai_summary?: string
 * }} RelationTypeBlock
 *
 * @typedef {{
 *   a: { element_count: Record<string, number>, modality_count: Record<string, number>, top_element?: string, top_modality?: string },
 *   b: { element_count: Record<string, number>, modality_count: Record<string, number>, top_element?: string, top_modality?: string },
 *   ai_summary?: string
 * }} BalanceBlock
 *
 * @typedef {{
 *   a_center: { dominant_sign?: string, dominant_house?: string, dominant_element?: string, dominant_modality?: string },
 *   b_center: { dominant_sign?: string, dominant_house?: string, dominant_element?: string, dominant_modality?: string },
 *   overlap?: { label?: string, line?: string },
 *   separation?: { label?: string, line?: string },
 *   flow?: { label?: string, line?: string },
 *   ai_summary?: string
 * }} CenterBlock
 *
 * @typedef {{
 *   main_axis?: string,
 *   dominant_tension?: string,
 *   dominant_flow?: string,
 *   dominant_relation_type?: string,
 *   links?: any[],
 *   ai_summary?: string
 * }} CoreBlock
 *
 * @typedef {{ connection: any, ai_summary?: string }} ConnectionItem
 * @typedef {{ flow: ConnectionItem[], friction: ConnectionItem[] }} FlowFrictionBlock
 * @typedef {{ communication: ConnectionItem[], attraction: ConnectionItem[] }} CommunicationAttractionBlock
 *
 * @typedef {{ key: string, row: any, ai_summary?: string }} BodyItem
 * @typedef {{ items: BodyItem[] }} BodiesBlock
 *
 * @typedef {{ key: string, row: any, ai_summary?: string }} AxisDeepItem
 * @typedef {{ axis: { items: AxisDeepItem[], ai_summary?: string }, deep: { items: AxisDeepItem[], ai_summary?: string } }} AxisDeepBlock
 *
 * @typedef {{ house: number, label?: string, items: string[], ai_summary?: string }} HouseIngressItem
 * @typedef {{ heading: string, items: HouseIngressItem[] }} HouseIngressBlock
 *
 * @typedef {{ name: string, ai_summary?: string, structure_summary?: string, evidence?: string[] }} PatternBlock
 *
 * @typedef {{
 *   relation_type: RelationTypeBlock,
 *   balance: BalanceBlock,
 *   center: CenterBlock,
 *   core: CoreBlock,
 *   flow_friction: FlowFrictionBlock,
 *   communication_attraction: CommunicationAttractionBlock,
 *   bodies_personal: BodiesBlock,
 *   bodies_social: BodiesBlock,
 *   axis_deep: AxisDeepBlock,
 *   house_ingress_ab: HouseIngressBlock,
 *   house_ingress_ba: HouseIngressBlock,
 *   pattern: PatternBlock
 * }} RelationBlocks
 */

module.exports = {};

