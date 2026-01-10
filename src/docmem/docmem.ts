// Docmem - Hierarchical Document Memory System
import { randomString } from '../tools/tools.js';
import { DocmemPostgres } from './docmem_postgres.js';
import { createHash } from 'crypto';

export interface NodeDict {
  id: string;
  parentId: string | null;
  text: string;
  order: number;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
  contextType: string;
  contextName: string;
  contextValue: string;
  readonly: number;
  hash: string | null;
}

export interface NodeStructure {
  id: string;
  parentId: string | null;
  order: number;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
  contextType: string;
  contextName: string;
  contextValue: string;
  readonly: number;
}

export class Node {
  id: string;
  parentId: string | null;
  text: string;
  order: number;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
  contextType: string;
  contextName: string;
  contextValue: string;
  readonly: number;
  hash: string | null;

  constructor(
    nodeId: string,
    parentId: string | null,
    text: string,
    order: number,
    tokenCount: number | null,
    createdAt: string | null,
    updatedAt: string | null,
    contextType: string,
    contextName: string,
    contextValue: string,
    readonly: number
  ) {
    if (!contextType || !contextName || !contextValue) {
      throw new Error('contextType, contextName, and contextValue are required');
    }
    this.id = nodeId;
    this.parentId = parentId;
    this.text = text;
    this.order = order;
    this.tokenCount = tokenCount !== null ? tokenCount : this._countTokens(text);
    this.createdAt = createdAt || new Date().toISOString();
    this.updatedAt = updatedAt || new Date().toISOString();
    this.contextType = contextType;
    this.contextName = contextName;
    this.contextValue = contextValue;
    this.readonly = readonly === undefined ? 0 : readonly;
    this.hash = null;
  }

  private _countTokens(text: string): number {
    if (!text) return 0;
    // Approximation: characters / 4
    return Math.ceil(text.length / 4);
  }

  toDict(): NodeDict {
    return {
      id: this.id,
      parentId: this.parentId,
      text: this.text,
      order: this.order,
      tokenCount: this.tokenCount,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      contextType: this.contextType,
      contextName: this.contextName,
      contextValue: this.contextValue,
      readonly: this.readonly,
      hash: this.hash
    };
  }

  static fromDict(data: NodeDict): Node {
    const node = new Node(
      data.id,
      data.parentId,
      data.text,
      data.order,
      data.tokenCount,
      data.createdAt,
      data.updatedAt,
      data.contextType,
      data.contextName,
      data.contextValue,
      data.readonly !== undefined ? data.readonly : 0
    );
    node.hash = data.hash || null;
    return node;
  }
}

/**
 * NodeHasher - Computes SHA-512 hash of node state for optimistic locking
 */
export class NodeHasher {
  /**
   * Compute hash for node state, set it on the node, and return the node
   * Hashes: parent_id, context_type, context_name, context_value, text, order
   */
  static hash(node: Node): Node {
    const data = [
      node.parentId || '',
      node.contextType || '',
      node.contextName || '',
      node.contextValue || '',
      node.text || '',
      String(node.order ?? '')
    ].join('|');

    const hashBuffer = createHash('sha512').update(data).digest();
    node.hash = hashBuffer.toString('base64');
    return node;
  }
}

/**
 * OptimisticLockError - Error thrown when optimistic locking fails due to concurrent modification
 */
export class OptimisticLockError extends Error {
  nodeId: string;

  constructor(nodeId: string, message: string) {
    super(`Optimistic lock failed for node ${nodeId}: ${message}. The node was modified by another operation. Please read the current state and retry your update.`);
    this.name = 'OptimisticLockError';
    this.nodeId = nodeId;
  }
}

export class Docmem {
  docmemId: string;
  postgres: DocmemPostgres;
  private _initPromise: Promise<void>;

  constructor(docmemId: string) {
    this.docmemId = docmemId;
    this.postgres = new DocmemPostgres();
    this._initPromise = this._init();
  }

  private async _init(): Promise<void> {
    const existingRoot = await this._getRootById(this.docmemId);
    if (!existingRoot) {
      await this._createRoot();
    }
  }

  async ready(): Promise<void> {
    await this._initPromise;
  }

  private async _getRootById(rootId: string): Promise<Node | null> {
    return this.postgres.getRootById(rootId);
  }

  private async _createRoot(
    contextType: string = 'root',
    contextName: string = 'purpose',
    contextValue: string = 'document'
  ): Promise<Node> {
    const existingRoot = await this._getRootById(this.docmemId);
    if (existingRoot) {
      return existingRoot;
    }

    const root = new Node(
      this.docmemId,
      null,
      '',
      0.0,
      null,
      null,
      null,
      contextType,
      contextName,
      contextValue,
      0
    );
    NodeHasher.hash(root);
    await this.postgres.insertNode(root);
    return root;
  }

  private _updateTimestamp(node: Node): void {
    node.updatedAt = new Date().toISOString();
  }

  private async _createAndInsertNode(
    parentId: string,
    content: string,
    order: number,
    contextType: string,
    contextName: string,
    contextValue: string,
    readonly: number = 0
  ): Promise<Node> {
    const node = this._createNodeWithContext(parentId, content, order, contextType, contextName, contextValue, readonly);
    NodeHasher.hash(node);
    await this.postgres.insertNode(node);
    return node;
  }

  private async _updateNode(node: Node, expectedHash: string): Promise<void> {
    this._updateTimestamp(node);
    await this.postgres.updateNodeContent(node, expectedHash);
  }

  private async _updateNodeContext(node: Node, expectedHash: string): Promise<void> {
    this._updateTimestamp(node);
    await this.postgres.updateNodeContext(node, expectedHash);
  }

  private async _getNode(nodeId: string): Promise<Node | null> {
    return this.postgres.getNode(nodeId);
  }

  private async _getChildren(parentId: string): Promise<Node[]> {
    return this.postgres.getChildren(parentId);
  }

  private async _insertNode(node: Node): Promise<void> {
    await this.postgres.insertNode(node);
  }

  async _getRoot(): Promise<Node> {
    const root = await this._getRootById(this.docmemId);
    if (!root) {
      throw new Error(`Root node not found for docmem: ${this.docmemId}`);
    }
    return root;
  }

  async _getAllRoots(): Promise<Node[]> {
    return this.postgres.getAllRoots();
  }

  static async getAllRoots(): Promise<Node[]> {
    return DocmemPostgres.getAllRoots();
  }

  private async _requireNode(nodeId: string): Promise<Node> {
    const node = await this._getNode(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }
    return node;
  }

  async _getRootOfNode(nodeId: string): Promise<Node> {
    let node = await this._requireNode(nodeId);
    while (node.parentId !== null) {
      node = await this._requireNode(node.parentId);
    }
    return node;
  }

  private async _getSortedChildren(parentId: string): Promise<Node[]> {
    const children = await this._getChildren(parentId);
    return [...children].sort((a, b) => a.order - b.order);
  }

  private async _calculateOrderForAppend(parentId: string): Promise<number> {
    const children = await this._getChildren(parentId);
    const maxOrder = children.length > 0
      ? Math.max(...children.map(c => c.order))
      : 0.0;
    return maxOrder + 1.0;
  }

  private _calculateOrderForBefore(targetNode: Node, sortedChildren: Node[], targetIdx: number): number {
    if (targetIdx > 0) {
      const siblingBefore = sortedChildren[targetIdx - 1];
      const targetOrder = targetNode.order;
      const siblingOrder = siblingBefore.order;
      return (siblingOrder * 4 + targetOrder * 1) / 5;
    } else {
      return targetNode.order - 1.0;
    }
  }

  private _calculateOrderForAfter(targetNode: Node, sortedChildren: Node[], targetIdx: number): number {
    if (targetIdx < sortedChildren.length - 1) {
      const siblingAfter = sortedChildren[targetIdx + 1];
      const targetOrder = targetNode.order;
      const siblingOrder = siblingAfter.order;
      return (targetOrder * 4 + siblingOrder * 1) / 5;
    } else {
      return targetNode.order + 1.0;
    }
  }

  private _findTargetIndexInSorted(sortedChildren: Node[], nodeId: string): number {
    const targetIdx = sortedChildren.findIndex(n => n.id === nodeId);
    if (targetIdx === -1) {
      throw new Error('Target node not found in parent children');
    }
    return targetIdx;
  }

  private async _validateCycleBeforeMove(nodeId: string, targetParentId: string): Promise<void> {
    if (nodeId === targetParentId) {
      throw new Error('Cannot move a node to be a child of itself');
    }

    const descendants: Node[] = [];
    await this._getAllDescendants(nodeId, descendants);
    const descendantIds = new Set(descendants.map(n => n.id));

    if (descendantIds.has(targetParentId)) {
      throw new Error('Cannot move a node to be a child of one of its descendants');
    }
  }

  private async _validateCycleBeforeMoveSibling(nodeId: string, targetNode: Node, operation: string): Promise<void> {
    if (nodeId === targetNode.id) {
      throw new Error(`Cannot move a node to be ${operation} itself`);
    }

    if (!targetNode.parentId) {
      throw new Error(`Cannot move a node to be ${operation} root node`);
    }

    const descendants: Node[] = [];
    await this._getAllDescendants(nodeId, descendants);
    const descendantIds = new Set(descendants.map(n => n.id));

    if (descendantIds.has(targetNode.parentId)) {
      throw new Error('Cannot move a node to be a sibling of a descendant');
    }
  }

  private async _updateNodeParentAndOrder(node: Node, expectedHash: string): Promise<Node> {
    this._updateTimestamp(node);
    await this.postgres.updateNodeParentAndOrder(node, expectedHash);
    const updated = await this._getNode(node.id);
    if (!updated) {
      throw new Error(`Node ${node.id} not found after update`);
    }
    return updated;
  }

  private _createNodeWithContext(
    parentId: string,
    content: string,
    order: number,
    contextType: string,
    contextName: string,
    contextValue: string,
    readonly: number = 0
  ): Node {
    const newNodeId = randomString(8);
    return new Node(
      newNodeId,
      parentId,
      content,
      order,
      null,
      null,
      null,
      contextType,
      contextName,
      contextValue,
      readonly
    );
  }

  async append_child(node_id: string, context_type: string, context_name: string, context_value: string, content: string): Promise<Node> {
    await this._requireNode(node_id);
    const newOrder = await this._calculateOrderForAppend(node_id);
    return await this._createAndInsertNode(node_id, content, newOrder, context_type, context_name, context_value);
  }

  async insert_before(node_id: string, context_type: string, context_name: string, context_value: string, content: string): Promise<Node> {
    const targetNode = await this._requireNode(node_id);

    const parentId = targetNode.parentId;
    if (!parentId) {
      throw new Error('Cannot insert before root node');
    }

    const sortedChildren = await this._getSortedChildren(parentId);
    const targetIdx = this._findTargetIndexInSorted(sortedChildren, node_id);
    const newOrder = this._calculateOrderForBefore(targetNode, sortedChildren, targetIdx);

    return await this._createAndInsertNode(parentId, content, newOrder, context_type, context_name, context_value);
  }

  async insert_after(node_id: string, context_type: string, context_name: string, context_value: string, content: string): Promise<Node> {
    const targetNode = await this._requireNode(node_id);

    const parentId = targetNode.parentId;
    if (!parentId) {
      throw new Error('Cannot insert after root node');
    }

    const sortedChildren = await this._getSortedChildren(parentId);
    const targetIdx = this._findTargetIndexInSorted(sortedChildren, node_id);
    const newOrder = this._calculateOrderForAfter(targetNode, sortedChildren, targetIdx);

    return await this._createAndInsertNode(parentId, content, newOrder, context_type, context_name, context_value);
  }

  async delete(node_id: string): Promise<void> {
    await this._requireNode(node_id);
    // Database cascade delete handles all descendants automatically
    await this.postgres.deleteNodeById(node_id);
  }

  async update_content(node_id: string, content: string): Promise<Node> {
    const node = await this._requireNode(node_id);
    if (node.readonly === 1) {
      throw new Error(`Cannot update content of readonly node ${node_id}`);
    }
    const expectedHash = node.hash;
    if (!expectedHash) {
      throw new Error(`Node ${node_id} does not have a hash`);
    }

    const tempNode = new Node(node_id, node.parentId, content, node.order, null, null, null, node.contextType, node.contextName, node.contextValue, node.readonly);
    node.text = content;
    node.tokenCount = tempNode.tokenCount;
    NodeHasher.hash(node);
    await this._updateNode(node, expectedHash);
    return node;
  }

  async update_context(node_id: string, context_type: string, context_name: string, context_value: string): Promise<Node> {
    const node = await this._requireNode(node_id);
    if (node.readonly === 1) {
      throw new Error(`Cannot update context of readonly node ${node_id}`);
    }
    const expectedHash = node.hash;
    if (!expectedHash) {
      throw new Error(`Node ${node_id} does not have a hash`);
    }

    node.contextType = context_type;
    node.contextName = context_name;
    node.contextValue = context_value;
    NodeHasher.hash(node);
    await this._updateNodeContext(node, expectedHash);
    return node;
  }

  async find(node_id: string): Promise<Node | null> {
    return this._getNode(node_id);
  }

  async move_append_child(node_id: string, target_parent_id: string): Promise<Node> {
    const node = await this._requireNode(node_id);
    const expectedHash = node.hash;
    if (!expectedHash) {
      throw new Error(`Node ${node_id} does not have a hash`);
    }
    await this._requireNode(target_parent_id);
    await this._validateCycleBeforeMove(node_id, target_parent_id);

    const newOrder = await this._calculateOrderForAppend(target_parent_id);
    node.parentId = target_parent_id;
    node.order = newOrder;
    NodeHasher.hash(node);
    return await this._updateNodeParentAndOrder(node, expectedHash);
  }

  async move_before(node_id: string, target_node_id: string): Promise<Node> {
    const node = await this._requireNode(node_id);
    const expectedHash = node.hash;
    if (!expectedHash) {
      throw new Error(`Node ${node_id} does not have a hash`);
    }
    const targetNode = await this._requireNode(target_node_id);
    await this._validateCycleBeforeMoveSibling(node_id, targetNode, 'before');

    const targetParentId = targetNode.parentId;
    if (!targetParentId) {
      throw new Error('Cannot move before root node');
    }
    const sortedChildren = await this._getSortedChildren(targetParentId);
    const targetIdx = this._findTargetIndexInSorted(sortedChildren, target_node_id);
    const newOrder = this._calculateOrderForBefore(targetNode, sortedChildren, targetIdx);

    node.parentId = targetParentId;
    node.order = newOrder;
    NodeHasher.hash(node);
    return await this._updateNodeParentAndOrder(node, expectedHash);
  }

  async move_after(node_id: string, target_node_id: string): Promise<Node> {
    const node = await this._requireNode(node_id);
    const expectedHash = node.hash;
    if (!expectedHash) {
      throw new Error(`Node ${node_id} does not have a hash`);
    }
    const targetNode = await this._requireNode(target_node_id);
    await this._validateCycleBeforeMoveSibling(node_id, targetNode, 'after');

    const targetParentId = targetNode.parentId;
    if (!targetParentId) {
      throw new Error('Cannot move after root node');
    }
    const sortedChildren = await this._getSortedChildren(targetParentId);
    const targetIdx = this._findTargetIndexInSorted(sortedChildren, target_node_id);
    const newOrder = this._calculateOrderForAfter(targetNode, sortedChildren, targetIdx);

    node.parentId = targetParentId;
    node.order = newOrder;
    NodeHasher.hash(node);
    return await this._updateNodeParentAndOrder(node, expectedHash);
  }

  private async _copyNodeRecursive(sourceNodeId: string, newParentId: string, newOrder: number): Promise<Node> {
    const sourceNode = await this._requireNode(sourceNodeId);
    const newNodeId = randomString(8);
    const newNode = new Node(
      newNodeId,
      newParentId,
      sourceNode.text,
      newOrder,
      sourceNode.tokenCount,
      new Date().toISOString(),
      new Date().toISOString(),
      sourceNode.contextType,
      sourceNode.contextName,
      sourceNode.contextValue,
      sourceNode.readonly
    );
    NodeHasher.hash(newNode);
    await this.postgres.insertNode(newNode);

    const children = await this._getChildren(sourceNodeId);
    let childOrder = await this._calculateOrderForAppend(newNodeId);
    for (const child of children) {
      await this._copyNodeRecursive(child.id, newNodeId, childOrder);
      childOrder += 1.0;
    }

    return newNode;
  }

  async copy_append_child(node_id: string, target_parent_id: string): Promise<Node> {
    await this._requireNode(node_id);
    await this._requireNode(target_parent_id);

    const newOrder = await this._calculateOrderForAppend(target_parent_id);
    return await this._copyNodeRecursive(node_id, target_parent_id, newOrder);
  }

  async copy_before(node_id: string, target_node_id: string): Promise<Node> {
    await this._requireNode(node_id);
    const targetNode = await this._requireNode(target_node_id);

    const targetParentId = targetNode.parentId;
    if (!targetParentId) {
      throw new Error('Cannot copy a node to be before root node');
    }

    const sortedChildren = await this._getSortedChildren(targetParentId);
    const targetIdx = this._findTargetIndexInSorted(sortedChildren, target_node_id);
    const newOrder = this._calculateOrderForBefore(targetNode, sortedChildren, targetIdx);

    return await this._copyNodeRecursive(node_id, targetParentId, newOrder);
  }

  async copy_after(node_id: string, target_node_id: string): Promise<Node> {
    await this._requireNode(node_id);
    const targetNode = await this._requireNode(target_node_id);

    const targetParentId = targetNode.parentId;
    if (!targetParentId) {
      throw new Error('Cannot copy a node to be after root node');
    }

    const sortedChildren = await this._getSortedChildren(targetParentId);
    const targetIdx = this._findTargetIndexInSorted(sortedChildren, target_node_id);
    const newOrder = this._calculateOrderForAfter(targetNode, sortedChildren, targetIdx);

    return await this._copyNodeRecursive(node_id, targetParentId, newOrder);
  }

  private async _getAllDescendants(nodeId: string, result: Node[]): Promise<void> {
    const children = await this._getChildren(nodeId);
    for (const child of children) {
      result.push(child);
      await this._getAllDescendants(child.id, result);
    }
  }

  async serialize(nodeId: string): Promise<Node[]> {
    if (!nodeId) {
      throw new Error('nodeId is required');
    }
    const result: Node[] = [];
    const startNode = await this._requireNode(nodeId);
    await this._serializeRecursive(startNode, result);
    return result;
  }

  private async _serializeRecursive(node: Node, result: Node[]): Promise<void> {
    result.push(node);
    const sortedChildren = await this._getSortedChildren(node.id);
    for (const child of sortedChildren) {
      await this._serializeRecursive(child, result);
    }
  }

  async structure(nodeId: string): Promise<NodeStructure[]> {
    if (!nodeId) {
      throw new Error('nodeId is required');
    }
    const result: NodeStructure[] = [];
    const startNode = await this._requireNode(nodeId);
    await this._structureRecursive(startNode, result);
    return result;
  }

  private async _structureRecursive(node: Node, result: NodeStructure[]): Promise<void> {
    result.push({
      id: node.id,
      parentId: node.parentId,
      order: node.order,
      tokenCount: node.tokenCount,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      contextType: node.contextType,
      contextName: node.contextName,
      contextValue: node.contextValue,
      readonly: node.readonly
    });
    const sortedChildren = await this._getSortedChildren(node.id);
    for (const child of sortedChildren) {
      await this._structureRecursive(child, result);
    }
  }

  /**
   * Expand a node to fit within a token budget.
   * 
   * Algorithm:
   * 1. Reverse BFS to build priority list (level-by-level, last children first within each level)
   * 2. Iterate through priority list, consuming budget until it's spent (no holes - stop on first failure)
   * 3. Preorder DFS traversal, rendering only nodes in the included set
   * 
   * The priority order guarantees parents come before children, so stopping
   * on budget exhaustion naturally prevents orphans.
   * 
   * Example: For tree ROOT -> A(C,D), B(E):
   * - Priority list: ROOT, B, A, E, D, C
   * - Budget consumed until exhausted, list truncated
   * - DFS render: ROOT, A, ..., B, ... (only included nodes)
   */
  async expandToLength(nodeId: string, maxTokens: number): Promise<Node[]> {
    if (!nodeId) {
      throw new Error('nodeId is required');
    }

    const startNode = await this._requireNode(nodeId);

    // Step 1: Build priority list via reverse BFS
    // Level-by-level, but within each level, reverse order (last children first)
    const priorityList: Node[] = [];
    let currentLevel: Node[] = [startNode];

    while (currentLevel.length > 0) {
      // Add nodes in reverse order (last ones have higher priority)
      for (let i = currentLevel.length - 1; i >= 0; i--) {
        priorityList.push(currentLevel[i]);
      }

      // Collect children for next level (maintain original order for proper grouping)
      const nextLevel: Node[] = [];
      for (const node of currentLevel) {
        const children = await this._getSortedChildren(node.id);
        nextLevel.push(...children);
      }

      currentLevel = nextLevel;
    }

    // Step 2: Consume budget - stop on first node that doesn't fit (no holes)
    const includedIds = new Set<string>();
    let totalTokens = 0;

    for (const node of priorityList) {
      const nodeTokens = node.tokenCount || 0;
      if (totalTokens + nodeTokens <= maxTokens) {
        includedIds.add(node.id);
        totalTokens += nodeTokens;
      } else {
        // Budget exhausted - stop here, truncate the rest
        break;
      }
    }

    // Step 3: Preorder DFS traversal, rendering only included nodes
    const result: Node[] = [];

    const renderDfs = async (node: Node): Promise<void> => {
      if (!includedIds.has(node.id)) {
        // Node not included - skip entire subtree
        return;
      }
      result.push(node);
      const children = await this._getSortedChildren(node.id);
      for (const child of children) {
        await renderDfs(child);
      }
    };

    await renderDfs(startNode);

    return result;
  }

  async add_summary(
    startNodeId: string,
    endNodeId: string,
    content: string,
    context_type: string,
    context_name: string,
    context_value: string
  ): Promise<Node> {
    if (!startNodeId || !endNodeId) {
      throw new Error('Must provide both start-node-id and end-node-id');
    }

    const startNode = await this._requireNode(startNodeId);
    const endNode = await this._requireNode(endNodeId);

    if (startNode.parentId !== endNode.parentId) {
      throw new Error(`Start node and end node must have the same parent. Start node parent: ${startNode.parentId}, End node parent: ${endNode.parentId}`);
    }

    const parentId = startNode.parentId;
    if (!parentId) {
      throw new Error('Cannot summarize root nodes');
    }

    await this._requireNode(parentId);

    const sortedSiblings = await this._getSortedChildren(parentId);

    const startIndex = sortedSiblings.findIndex(n => n.id === startNodeId);
    const endIndex = sortedSiblings.findIndex(n => n.id === endNodeId);

    if (startIndex === -1) {
      throw new Error(`Start node ${startNodeId} not found as a child of parent ${parentId}`);
    }
    if (endIndex === -1) {
      throw new Error(`End node ${endNodeId} not found as a child of parent ${parentId}`);
    }

    if (startIndex > endIndex) {
      throw new Error(`Start node must come before or equal to end node in sibling order. Start index: ${startIndex}, End index: ${endIndex}`);
    }

    const memoryNodesSorted = sortedSiblings.slice(startIndex, endIndex + 1);

    const nodesWithChildren: Node[] = [];
    for (const n of memoryNodesSorted) {
      const children = await this._getChildren(n.id);
      if (children.length > 0) {
        nodesWithChildren.push(n);
      }
    }
    if (nodesWithChildren.length > 0) {
      throw new Error(`All nodes to summarize must be leaf nodes (have no children). Nodes with children: ${nodesWithChildren.map(n => n.id).join(', ')}`);
    }

    const minOrder = memoryNodesSorted[0].order;
    const maxOrder = memoryNodesSorted[memoryNodesSorted.length - 1].order;
    const summaryOrder = (minOrder + maxOrder) / 2;

    const summaryNode = await this._createAndInsertNode(parentId, content, summaryOrder, context_type, context_name, context_value);

    for (const memoryNode of memoryNodesSorted) {
      if (!memoryNode.hash) {
        throw new Error(`Node ${memoryNode.id} does not have a hash. Cannot perform optimistic locking check.`);
      }
      const expectedHash = memoryNode.hash;

      const oldParentId = memoryNode.parentId;
      memoryNode.parentId = summaryNode.id;
      NodeHasher.hash(memoryNode);
      this._updateTimestamp(memoryNode);

      try {
        await this.postgres.updateNodeParent(memoryNode.id, memoryNode.parentId, memoryNode.hash, memoryNode.updatedAt, expectedHash);
      } catch (error) {
        memoryNode.parentId = oldParentId;
        throw error;
      }
    }

    return summaryNode;
  }
}
