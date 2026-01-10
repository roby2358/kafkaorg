import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Node, Docmem } from '../src/docmem/docmem.js';

/**
 * Tests for Docmem.expandToLength
 * 
 * The expand algorithm (level-priority BFS):
 * 1. Process nodes level-by-level (BFS) — parents/siblings before children
 * 2. Within each level, prioritize LAST nodes (reverse order) when trimming
 * 3. Only descend into children of INCLUDED parents
 * 4. Output in DFS order for proper tree serialization
 */

// Helper to create a mock node
function createNode(
  id: string,
  parentId: string | null,
  text: string,
  order: number,
  tokenCount: number
): Node {
  return new Node(
    id,
    parentId,
    text,
    order,
    tokenCount,
    new Date().toISOString(),
    new Date().toISOString(),
    'test',
    'name',
    'value',
    0
  );
}

describe('Docmem.expandToLength', () => {
  let docmem: Docmem;
  let mockNodes: Map<string, Node>;
  let mockChildren: Map<string, Node[]>;

  beforeEach(() => {
    mockNodes = new Map();
    mockChildren = new Map();

    // Create docmem with mocked postgres
    docmem = new Docmem('test-root');

    // Override the internal methods to use our mock data
    // @ts-expect-error - accessing private method for testing
    docmem._requireNode = vi.fn(async (nodeId: string) => {
      const node = mockNodes.get(nodeId);
      if (!node) throw new Error(`Node ${nodeId} not found`);
      return node;
    });

    // @ts-expect-error - accessing private method for testing
    docmem._getSortedChildren = vi.fn(async (parentId: string) => {
      const children = mockChildren.get(parentId) || [];
      return [...children].sort((a, b) => a.order - b.order);
    });
  });

  /**
   * Tree structure for basic tests:
   *       ROOT (10 tokens)
   *      /    \
   *     A      B      (A: 20 tokens, B: 20 tokens) - summaries
   *    / \    / \
   *   C   D  E   F    (each 100 tokens) - leaves
   * 
   * DFS order: ROOT, A, C, D, B, E, F
   * Leaves in DFS order: C, D, E, F
   */
  function setupBasicTree() {
    const root = createNode('ROOT', null, 'Root content', 0, 10);
    const a = createNode('A', 'ROOT', 'Summary A', 1, 20);
    const b = createNode('B', 'ROOT', 'Summary B', 2, 20);
    const c = createNode('C', 'A', 'Leaf C', 1, 100);
    const d = createNode('D', 'A', 'Leaf D', 2, 100);
    const e = createNode('E', 'B', 'Leaf E', 1, 100);
    const f = createNode('F', 'B', 'Leaf F', 2, 100);

    mockNodes.set('ROOT', root);
    mockNodes.set('A', a);
    mockNodes.set('B', b);
    mockNodes.set('C', c);
    mockNodes.set('D', d);
    mockNodes.set('E', e);
    mockNodes.set('F', f);

    mockChildren.set('ROOT', [a, b]);
    mockChildren.set('A', [c, d]);
    mockChildren.set('B', [e, f]);
    mockChildren.set('C', []);
    mockChildren.set('D', []);
    mockChildren.set('E', []);
    mockChildren.set('F', []);

    return { root, a, b, c, d, e, f };
  }

  it('should include all nodes when budget is unlimited', async () => {
    setupBasicTree();

    const result = await docmem.expandToLength('ROOT', 10000);

    // Should return all nodes in DFS order
    expect(result.map(n => n.id)).toEqual(['ROOT', 'A', 'C', 'D', 'B', 'E', 'F']);
  });

  it('should include only summary nodes when budget is very tight', async () => {
    setupBasicTree();

    // Summary tokens: ROOT(10) + A(20) + B(20) = 50
    // No room for leaves
    const result = await docmem.expandToLength('ROOT', 50);

    // Should return only summaries in DFS order
    expect(result.map(n => n.id)).toEqual(['ROOT', 'A', 'B']);
  });

  it('should keep last leaves when budget allows some leaves', async () => {
    setupBasicTree();

    // Summary tokens: 50
    // Room for 2 leaves (200 tokens)
    // Leaves in reverse DFS order: F, E, D, C
    // So we keep F and E
    const result = await docmem.expandToLength('ROOT', 250);

    // Should return summaries + last 2 leaves (E, F) in DFS order
    expect(result.map(n => n.id)).toEqual(['ROOT', 'A', 'B', 'E', 'F']);
  });

  it('should keep last 3 leaves when budget allows', async () => {
    setupBasicTree();

    // Summary tokens: 50
    // Room for 3 leaves (300 tokens)
    // Leaves in reverse DFS order: F, E, D, C
    // So we keep F, E, D
    const result = await docmem.expandToLength('ROOT', 350);

    // Should return summaries + last 3 leaves (D, E, F) in DFS order
    expect(result.map(n => n.id)).toEqual(['ROOT', 'A', 'D', 'B', 'E', 'F']);
  });

  it('should handle single node (root is leaf)', async () => {
    const root = createNode('ROOT', null, 'Just a root', 0, 50);
    mockNodes.set('ROOT', root);
    mockChildren.set('ROOT', []);

    const result = await docmem.expandToLength('ROOT', 100);

    expect(result.map(n => n.id)).toEqual(['ROOT']);
  });

  it('should handle single node with insufficient budget', async () => {
    const root = createNode('ROOT', null, 'Just a root', 0, 50);
    mockNodes.set('ROOT', root);
    mockChildren.set('ROOT', []);

    // Not enough for even the root (which is a leaf in this case)
    const result = await docmem.expandToLength('ROOT', 10);

    // Root is a leaf, so it can be excluded when budget is too tight
    expect(result.map(n => n.id)).toEqual([]);
  });

  /**
   * Deep tree:
   *       ROOT (10)
   *         |
   *         A (20)     - summary
   *         |
   *         B (20)     - summary  
   *         |
   *         C (100)    - leaf
   */
  it('should handle deep tree correctly', async () => {
    const root = createNode('ROOT', null, 'Root', 0, 10);
    const a = createNode('A', 'ROOT', 'Summary A', 1, 20);
    const b = createNode('B', 'A', 'Summary B', 1, 20);
    const c = createNode('C', 'B', 'Leaf C', 1, 100);

    mockNodes.set('ROOT', root);
    mockNodes.set('A', a);
    mockNodes.set('B', b);
    mockNodes.set('C', c);

    mockChildren.set('ROOT', [a]);
    mockChildren.set('A', [b]);
    mockChildren.set('B', [c]);
    mockChildren.set('C', []);

    // All summaries: 10 + 20 + 20 = 50
    // With budget 50, should include summaries only
    const result = await docmem.expandToLength('ROOT', 50);
    expect(result.map(n => n.id)).toEqual(['ROOT', 'A', 'B']);

    // With budget 150, should include leaf too
    const result2 = await docmem.expandToLength('ROOT', 150);
    expect(result2.map(n => n.id)).toEqual(['ROOT', 'A', 'B', 'C']);
  });

  /**
   * Multiple children at same level with varying sizes:
   *       ROOT (10)
   *      /  |   \
   *     A   B    C     (all leaves, different sizes)
   *    50  200  100
   */
  it('should prioritize last leaves with varying sizes', async () => {
    const root = createNode('ROOT', null, 'Root', 0, 10);
    const a = createNode('A', 'ROOT', 'Leaf A', 1, 50);
    const b = createNode('B', 'ROOT', 'Leaf B', 2, 200);
    const c = createNode('C', 'ROOT', 'Leaf C', 3, 100);

    mockNodes.set('ROOT', root);
    mockNodes.set('A', a);
    mockNodes.set('B', b);
    mockNodes.set('C', c);

    // Root has children, so it's a summary
    mockChildren.set('ROOT', [a, b, c]);
    mockChildren.set('A', []);
    mockChildren.set('B', []);
    mockChildren.set('C', []);

    // Summary: 10 tokens
    // Leaves in reverse order: C(100), B(200), A(50)
    // Budget 120: 10 (ROOT) + 100 (C) = 110, B doesn't fit
    const result = await docmem.expandToLength('ROOT', 120);
    expect(result.map(n => n.id)).toEqual(['ROOT', 'C']);

    // Budget 360: 10 + 50 + 200 + 100 = 360, all fit
    const result2 = await docmem.expandToLength('ROOT', 360);
    expect(result2.map(n => n.id)).toEqual(['ROOT', 'A', 'B', 'C']);
  });

  it('should stop on first node that doesnt fit (no holes)', async () => {
    const root = createNode('ROOT', null, 'Root', 0, 10);
    const a = createNode('A', 'ROOT', 'Small A', 1, 20);
    const b = createNode('B', 'ROOT', 'Big B', 2, 500);
    const c = createNode('C', 'ROOT', 'Small C', 3, 20);

    mockNodes.set('ROOT', root);
    mockNodes.set('A', a);
    mockNodes.set('B', b);
    mockNodes.set('C', c);

    mockChildren.set('ROOT', [a, b, c]);
    mockChildren.set('A', []);
    mockChildren.set('B', []);
    mockChildren.set('C', []);

    // Priority list (reverse BFS): ROOT, C, B, A
    // Budget 60: ROOT(10) ✓, C(20) ✓, B(500) ✗ STOP
    // No holes - A is not tried even though it would fit
    const result = await docmem.expandToLength('ROOT', 60);
    expect(result.map(n => n.id)).toEqual(['ROOT', 'C']);
  });

  /**
   * Deep hierarchy test - verifies level priority over depth
   *         ROOT (10)
   *        /    \
   *       A      B         (20 each)
   *      / \      \
   *     C   D      E       (C: 30, D: 100, E: 100)
   *    / \
   *   F   G                (50 each)
   * 
   * With budget 150:
   * - Level 0: ROOT (10) ✓
   * - Level 1: B (20) ✓, A (20) ✓ = 50
   * - Level 2: E (100) ✓ = 150, D skip, C skip
   * - Level 3: not reached (C not included, so F, G not considered)
   * 
   * Result: ROOT, A, B, E
   * 
   * This differs from "summaries mandatory" which would give:
   * ROOT, A, C, B, G (prioritizes deep summary C over sibling E)
   */
  it('should prioritize siblings over deep descendants (level priority)', async () => {
    const root = createNode('ROOT', null, 'Root', 0, 10);
    const a = createNode('A', 'ROOT', 'A', 1, 20);
    const b = createNode('B', 'ROOT', 'B', 2, 20);
    const c = createNode('C', 'A', 'C', 1, 30);
    const d = createNode('D', 'A', 'D', 2, 100);
    const e = createNode('E', 'B', 'E', 1, 100);
    const f = createNode('F', 'C', 'F', 1, 50);
    const g = createNode('G', 'C', 'G', 2, 50);

    mockNodes.set('ROOT', root);
    mockNodes.set('A', a);
    mockNodes.set('B', b);
    mockNodes.set('C', c);
    mockNodes.set('D', d);
    mockNodes.set('E', e);
    mockNodes.set('F', f);
    mockNodes.set('G', g);

    mockChildren.set('ROOT', [a, b]);
    mockChildren.set('A', [c, d]);
    mockChildren.set('B', [e]);
    mockChildren.set('C', [f, g]);
    mockChildren.set('D', []);
    mockChildren.set('E', []);
    mockChildren.set('F', []);
    mockChildren.set('G', []);

    // Budget 150: should get ROOT, A, B (level 0-1) + E (level 2, last sibling)
    // NOT: ROOT, A, C, B, G (which prioritizes deep summary C)
    const result = await docmem.expandToLength('ROOT', 150);
    expect(result.map(n => n.id)).toEqual(['ROOT', 'A', 'B', 'E']);
  });

  it('should include deeper nodes when budget allows (no holes)', async () => {
    const root = createNode('ROOT', null, 'Root', 0, 10);
    const a = createNode('A', 'ROOT', 'A', 1, 20);
    const b = createNode('B', 'ROOT', 'B', 2, 20);
    const c = createNode('C', 'A', 'C', 1, 30);
    const d = createNode('D', 'A', 'D', 2, 100);
    const e = createNode('E', 'B', 'E', 1, 100);
    const f = createNode('F', 'C', 'F', 1, 50);
    const g = createNode('G', 'C', 'G', 2, 50);

    mockNodes.set('ROOT', root);
    mockNodes.set('A', a);
    mockNodes.set('B', b);
    mockNodes.set('C', c);
    mockNodes.set('D', d);
    mockNodes.set('E', e);
    mockNodes.set('F', f);
    mockNodes.set('G', g);

    mockChildren.set('ROOT', [a, b]);
    mockChildren.set('A', [c, d]);
    mockChildren.set('B', [e]);
    mockChildren.set('C', [f, g]);
    mockChildren.set('D', []);
    mockChildren.set('E', []);
    mockChildren.set('F', []);
    mockChildren.set('G', []);

    // Priority list (reverse BFS): ROOT, B, A, E, D, C, G, F
    // Budget 200:
    // ROOT(10) ✓, B(20) ✓, A(20) ✓, E(100) ✓ = 150
    // D(100) ✗ STOP (150+100=250 > 200)
    // Result: ROOT, A, B, E (in DFS order)
    const result = await docmem.expandToLength('ROOT', 200);
    expect(result.map(n => n.id)).toEqual(['ROOT', 'A', 'B', 'E']);
  });

  it('should stop when large node doesnt fit (truncates priority list)', async () => {
    const root = createNode('ROOT', null, 'Root', 0, 10);
    const a = createNode('A', 'ROOT', 'A', 1, 200); // Too big!
    const b = createNode('B', 'ROOT', 'B', 2, 20);
    const c = createNode('C', 'A', 'C', 1, 10); // Child of A
    const d = createNode('D', 'B', 'D', 1, 10); // Child of B

    mockNodes.set('ROOT', root);
    mockNodes.set('A', a);
    mockNodes.set('B', b);
    mockNodes.set('C', c);
    mockNodes.set('D', d);

    mockChildren.set('ROOT', [a, b]);
    mockChildren.set('A', [c]);
    mockChildren.set('B', [d]);
    mockChildren.set('C', []);
    mockChildren.set('D', []);

    // Priority list (reverse BFS): ROOT, B, A, D, C
    // Budget 50:
    // ROOT(10) ✓, B(20) ✓ = 30
    // A(200) ✗ STOP
    // D and C are never considered (truncated)
    const result = await docmem.expandToLength('ROOT', 50);
    expect(result.map(n => n.id)).toEqual(['ROOT', 'B']);
    // Note: D is NOT included even though it's small and its parent B is included,
    // because A (higher priority) didn't fit and we stopped there
  });
});
