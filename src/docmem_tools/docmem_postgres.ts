// DocmemPostgres - PostgreSQL implementation of docmem database operations
import { prisma } from '../db/client.js';
import { Node, OptimisticLockError } from './docmem.js';

export class DocmemPostgres {
  private rowToNode(row: {
    id: string;
    parentId: string | null;
    text: string;
    orderValue: number;
    tokenCount: number;
    createdAt: Date;
    updatedAt: Date;
    contextType: string;
    contextName: string;
    contextValue: string;
    readonly: number;
    hash: string | null;
  }): Node {
    const node = new Node(
      row.id,
      row.parentId,
      row.text,
      row.orderValue,
      row.tokenCount,
      row.createdAt.toISOString(),
      row.updatedAt.toISOString(),
      row.contextType,
      row.contextName,
      row.contextValue,
      row.readonly !== undefined ? row.readonly : 0
    );
    node.hash = row.hash || null;
    return node;
  }

  async insertNode(node: Node): Promise<void> {
    await prisma.docmemNode.create({
      data: {
        id: node.id,
        parentId: node.parentId,
        text: node.text,
        orderValue: node.order,
        tokenCount: node.tokenCount,
        createdAt: new Date(node.createdAt),
        updatedAt: new Date(node.updatedAt),
        contextType: node.contextType,
        contextName: node.contextName,
        contextValue: node.contextValue,
        readonly: node.readonly,
        hash: node.hash,
      },
    });
  }

  async getNode(nodeId: string): Promise<Node | null> {
    const row = await prisma.docmemNode.findUnique({
      where: { id: nodeId },
    });
    if (!row) return null;
    return this.rowToNode(row);
  }

  async getRootById(rootId: string): Promise<Node | null> {
    const row = await prisma.docmemNode.findFirst({
      where: {
        id: rootId,
        parentId: null,
      },
    });
    if (!row) return null;
    return this.rowToNode(row);
  }

  async getChildren(parentId: string): Promise<Node[]> {
    const rows = await prisma.docmemNode.findMany({
      where: { parentId },
      orderBy: { orderValue: 'asc' },
    });
    return rows.map(row => this.rowToNode(row));
  }

  async getAllRoots(): Promise<Node[]> {
    const rows = await prisma.docmemNode.findMany({
      where: { parentId: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(row => this.rowToNode(row));
  }

  static async getAllRoots(): Promise<Node[]> {
    const rows = await prisma.docmemNode.findMany({
      where: { parentId: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(row => {
      const node = new Node(
        row.id,
        row.parentId,
        row.text,
        row.orderValue,
        row.tokenCount,
        row.createdAt.toISOString(),
        row.updatedAt.toISOString(),
        row.contextType,
        row.contextName,
        row.contextValue,
        row.readonly !== undefined ? row.readonly : 0
      );
      node.hash = row.hash || null;
      return node;
    });
  }

  async deleteNodeById(nodeId: string): Promise<void> {
    await prisma.docmemNode.delete({
      where: { id: nodeId },
    });
  }

  private async checkOptimisticLockFailure(nodeId: string, expectedHash: string): Promise<never> {
    const existingNode = await prisma.docmemNode.findUnique({
      where: { id: nodeId },
    });

    if (!existingNode) {
      throw new OptimisticLockError(nodeId, 'Another agent deleted the node');
    }

    if (existingNode.hash !== expectedHash) {
      throw new OptimisticLockError(nodeId, 'Another agent changed the node. Review the operation and try again.');
    }

    throw new OptimisticLockError(nodeId, 'Could not update the node with hash. Please review the operation and try again.');
  }

  async updateNodeContent(node: Node, expectedHash: string): Promise<void> {
    const result = await prisma.docmemNode.updateMany({
      where: {
        id: node.id,
        hash: expectedHash,
      },
      data: {
        text: node.text,
        tokenCount: node.tokenCount,
        updatedAt: new Date(node.updatedAt),
        hash: node.hash,
      },
    });

    if (result.count === 0) {
      await this.checkOptimisticLockFailure(node.id, expectedHash);
    }
  }

  async updateNodeContext(node: Node, expectedHash: string): Promise<void> {
    const result = await prisma.docmemNode.updateMany({
      where: {
        id: node.id,
        hash: expectedHash,
      },
      data: {
        contextType: node.contextType,
        contextName: node.contextName,
        contextValue: node.contextValue,
        updatedAt: new Date(node.updatedAt),
        hash: node.hash,
      },
    });

    if (result.count === 0) {
      await this.checkOptimisticLockFailure(node.id, expectedHash);
    }
  }

  async updateNodeParentAndOrder(node: Node, expectedHash: string): Promise<void> {
    const result = await prisma.docmemNode.updateMany({
      where: {
        id: node.id,
        hash: expectedHash,
      },
      data: {
        parentId: node.parentId,
        orderValue: node.order,
        updatedAt: new Date(node.updatedAt),
        hash: node.hash,
      },
    });

    if (result.count === 0) {
      await this.checkOptimisticLockFailure(node.id, expectedHash);
    }
  }

  async updateNodeParent(
    nodeId: string,
    parentId: string | null,
    hash: string | null,
    updatedAt: string,
    expectedHash: string
  ): Promise<void> {
    const result = await prisma.docmemNode.updateMany({
      where: {
        id: nodeId,
        hash: expectedHash,
      },
      data: {
        parentId: parentId,
        hash: hash,
        updatedAt: new Date(updatedAt),
      },
    });

    if (result.count === 0) {
      await this.checkOptimisticLockFailure(nodeId, expectedHash);
    }
  }
}
