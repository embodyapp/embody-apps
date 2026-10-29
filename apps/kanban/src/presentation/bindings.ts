import type { GenUiDocument, GenUiNode } from '@embody/genui/document';
import type { GenUiPayloadBinding } from '@embody/genui/payload';

export function boardBindings(document: GenUiDocument): Readonly<Record<string, GenUiPayloadBinding>> {
  const bindings: Record<string, GenUiPayloadBinding> = {};
  function walk(node: GenUiNode) {
    if (node.type === 'form' && node.event.target === 'tracker.moveTask') {
      const schema = node.event.schema;
      if (schema.type !== 'object') throw new Error('Invalid move action');
      const id = schema.properties.id;
      const expected = schema.properties.expectedStatus;
      if (id?.type !== 'string' || id.enum?.length !== 1 || expected?.type !== 'string' || expected.enum?.length !== 1)
        throw new Error('Invalid move binding');
      bindings[node.id] = { kind: 'object', fields: {
        id: { kind: 'literal', value: id.enum[0]! },
        expectedStatus: { kind: 'literal', value: expected.enum[0]! },
        status: { kind: 'field', id: `status-${id.enum[0]}` },
        cancellationReason: { kind: 'field', id: `reason-${id.enum[0]}` },
      } };
    }
    if (node.type === 'actions') for (const action of node.actions) {
      const fields: Record<string, GenUiPayloadBinding> = {};
      const schema = action.event.schema;
      if (schema.type !== 'object') throw new Error('Invalid board action');
      for (const key of schema.required) {
        const property = schema.properties[key];
        if (property?.type === 'string' && property.enum?.length === 1)
          fields[key] = { kind: 'literal', value: property.enum[0]! };
        else if (property?.type === 'integer' && property.minimum === property.maximum)
          fields[key] = { kind: 'literal', value: property.minimum };
        else throw new Error('Invalid board binding');
      }
      bindings[action.id] = { kind: 'object', fields };
    }
    if ('children' in node) node.children.forEach(walk);
    if (node.type === 'list') node.items.forEach(walk);
  }
  walk(document.root);
  return bindings;
}
