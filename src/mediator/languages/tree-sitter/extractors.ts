/**
 * Tree-sitter AST Extractors
 * [ENH: TREE-SITTER] Extract imports/exports/functions/classes from AST
 */

import { ImportInfo, ExportInfo, FunctionInfo, ClassInfo } from '../../types.js';
import type { TreeSitterTree } from './index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TreeSitterNode = any;

// =============================================================================
// TypeScript/JavaScript Extractor
// =============================================================================

export function extractTsImports(tree: TreeSitterTree): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const root = tree.rootNode;

  // Find all import statements
  const importNodes = root.descendantsOfType([
    'import_statement',
    'import_clause',
    'call_expression' // for dynamic imports
  ]);

  for (const node of importNodes) {
    if (!node) continue;

    if (node.type === 'import_statement') {
      const source = node.childForFieldName('source');
      if (source) {
        const sourceText = source.text.replace(/['"]/g, '');
        const specifiers: string[] = [];
        let isDefault = false;

        // Get import clause
        const importClause = node.children.find((c: TreeSitterNode) => c?.type === 'import_clause');
        if (importClause) {
          // Default import
          const defaultImport = importClause.children.find((c: TreeSitterNode) => c?.type === 'identifier');
          if (defaultImport) {
            specifiers.push(defaultImport.text);
            isDefault = true;
          }

          // Named imports
          const namedImports = importClause.descendantsOfType('import_specifier');
          for (const spec of namedImports) {
            if (spec) {
              const name = spec.childForFieldName('name');
              if (name) specifiers.push(name.text);
            }
          }

          // Namespace import (* as name)
          const namespaceImport = importClause.children.find((c: TreeSitterNode) => c?.type === 'namespace_import');
          if (namespaceImport) {
            const name = namespaceImport.childForFieldName('name');
            if (name) specifiers.push(`* as ${name.text}`);
          }
        }

        imports.push({
          source: sourceText,
          specifiers,
          isDefault: isDefault && specifiers.length === 1,
          isDynamic: false,
          line: node.startPosition.row + 1
        });
      }
    }

    // Dynamic imports: import('...')
    if (node.type === 'call_expression') {
      const func = node.childForFieldName('function');
      if (func?.type === 'import') {
        const args = node.childForFieldName('arguments');
        if (args) {
          const firstArg = args.children.find((c: TreeSitterNode) => c?.type === 'string');
          if (firstArg) {
            imports.push({
              source: firstArg.text.replace(/['"]/g, ''),
              specifiers: [],
              isDefault: false,
              isDynamic: true,
              line: node.startPosition.row + 1
            });
          }
        }
      }
    }
  }

  return imports;
}

export function extractTsExports(tree: TreeSitterTree): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const root = tree.rootNode;

  // Find all export statements
  const exportNodes = root.descendantsOfType([
    'export_statement',
    'export_clause'
  ]);

  for (const node of exportNodes) {
    if (!node) continue;

    if (node.type === 'export_statement') {
      // Check for default export
      const isDefault = node.children.some((c: TreeSitterNode) => c?.type === 'default');

      // Get declaration
      const declaration = node.childForFieldName('declaration');
      if (declaration) {
        let name = 'default';
        let type: ExportInfo['type'] = 'variable';

        if (declaration.type === 'function_declaration' || declaration.type === 'function') {
          type = 'function';
          const nameNode = declaration.childForFieldName('name');
          if (nameNode) name = nameNode.text;
        } else if (declaration.type === 'class_declaration' || declaration.type === 'class') {
          type = 'class';
          const nameNode = declaration.childForFieldName('name');
          if (nameNode) name = nameNode.text;
        } else if (declaration.type === 'lexical_declaration' || declaration.type === 'variable_declaration') {
          const declarator = declaration.children.find((c: TreeSitterNode) =>
            c?.type === 'variable_declarator' || c?.type === 'lexical_binding'
          );
          if (declarator) {
            const nameNode = declarator.childForFieldName('name');
            if (nameNode) name = nameNode.text;
          }
        } else if (declaration.type === 'type_alias_declaration' || declaration.type === 'interface_declaration') {
          type = 'type';
          const nameNode = declaration.childForFieldName('name');
          if (nameNode) name = nameNode.text;
        }

        exports.push({
          name,
          isDefault,
          type,
          line: node.startPosition.row + 1
        });
      }

      // Export clause: export { a, b }
      const exportClause = node.children.find((c: TreeSitterNode) => c?.type === 'export_clause');
      if (exportClause) {
        const specifiers = exportClause.descendantsOfType('export_specifier');
        for (const spec of specifiers) {
          if (spec) {
            const nameNode = spec.childForFieldName('name');
            if (nameNode) {
              exports.push({
                name: nameNode.text,
                isDefault: false,
                type: 'variable',
                line: spec.startPosition.row + 1
              });
            }
          }
        }
      }

      // Re-export: export * from '...'
      const source = node.childForFieldName('source');
      if (source && !declaration) {
        exports.push({
          name: '*',
          isDefault: false,
          type: 're-export',
          line: node.startPosition.row + 1
        });
      }
    }
  }

  return exports;
}

export function extractTsFunctions(tree: TreeSitterTree): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const root = tree.rootNode;

  // Find all function declarations
  const funcNodes = root.descendantsOfType([
    'function_declaration',
    'arrow_function',
    'function_expression',
    'method_definition'
  ]);

  for (const node of funcNodes) {
    if (!node) continue;

    // Skip methods inside classes (they're handled separately)
    const parent = node.parent;
    if (parent?.type === 'class_body') continue;

    let name = '';
    const nameNode = node.childForFieldName('name');
    if (nameNode) {
      name = nameNode.text;
    } else if (node.type === 'arrow_function' || node.type === 'function_expression') {
      // For arrow functions, check parent variable declarator
      if (parent?.type === 'variable_declarator') {
        const varName = parent.childForFieldName('name');
        if (varName) name = varName.text;
      }
    }

    if (!name) continue;

    const params = node.childForFieldName('parameters');
    const parameters: string[] = [];
    if (params) {
      const paramNodes = params.descendantsOfType(['required_parameter', 'optional_parameter', 'identifier']);
      for (const p of paramNodes) {
        if (p?.type === 'identifier' && p.parent?.type === 'formal_parameters') {
          parameters.push(p.text);
        } else if (p) {
          const paramName = p.childForFieldName('pattern') || p.childForFieldName('name');
          if (paramName) parameters.push(paramName.text);
        }
      }
    }

    // Check if exported
    const isExported = node.parent?.type === 'export_statement' ||
      node.parent?.parent?.type === 'export_statement';

    // Check if async
    const isAsync = node.children.some((c: TreeSitterNode) => c?.type === 'async');

    functions.push({
      name,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      isAsync,
      isExported,
      parameters,
      calls: [] // Would need more complex analysis
    });
  }

  return functions;
}

export function extractTsClasses(tree: TreeSitterTree): ClassInfo[] {
  const classes: ClassInfo[] = [];
  const root = tree.rootNode;

  const classNodes = root.descendantsOfType(['class_declaration', 'class']);

  for (const node of classNodes) {
    if (!node) continue;

    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;

    const name = nameNode.text;

    // Get extends
    const heritage = node.childForFieldName('heritage');
    let extendsClass: string | undefined;
    let implementsList: string[] | undefined;

    if (heritage) {
      const extendsClause = heritage.children.find((c: TreeSitterNode) => c?.type === 'extends_clause');
      if (extendsClause) {
        const value = extendsClause.childForFieldName('value');
        if (value) extendsClass = value.text;
      }

      const implementsClause = heritage.children.find((c: TreeSitterNode) => c?.type === 'implements_clause');
      if (implementsClause) {
        implementsList = implementsClause.descendantsOfType('type_identifier')
          .filter((n: TreeSitterNode) => n)
          .map((n: TreeSitterNode) => n!.text);
      }
    }

    // Get methods
    const body = node.childForFieldName('body');
    const methods: string[] = [];
    if (body) {
      const methodNodes = body.descendantsOfType(['method_definition', 'public_field_definition']);
      for (const m of methodNodes) {
        if (m?.type === 'method_definition') {
          const methodName = m.childForFieldName('name');
          if (methodName && methodName.text !== 'constructor') {
            methods.push(methodName.text);
          }
        }
      }
    }

    // Check if exported
    const isExported = node.parent?.type === 'export_statement';

    classes.push({
      name,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      isExported,
      extends: extendsClass,
      implements: implementsList,
      methods
    });
  }

  return classes;
}

// =============================================================================
// Python Extractor
// =============================================================================

export function extractPythonImports(tree: TreeSitterTree): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const root = tree.rootNode;

  const importNodes = root.descendantsOfType([
    'import_statement',
    'import_from_statement'
  ]);

  for (const node of importNodes) {
    if (!node) continue;

    if (node.type === 'import_statement') {
      // import x, y, z
      const names = node.descendantsOfType(['dotted_name', 'aliased_import']);
      for (const n of names) {
        if (n) {
          imports.push({
            source: n.text.split(' as ')[0],
            specifiers: [n.text],
            isDefault: false,
            isDynamic: false,
            line: node.startPosition.row + 1
          });
        }
      }
    } else if (node.type === 'import_from_statement') {
      // from x import y, z
      const moduleNode = node.childForFieldName('module_name');
      if (moduleNode) {
        const source = moduleNode.text;
        const specifiers: string[] = [];

        const importedNames = node.descendantsOfType(['dotted_name', 'aliased_import']);
        for (const n of importedNames) {
          if (n && n !== moduleNode) {
            specifiers.push(n.text.split(' as ')[0]);
          }
        }

        // Check for wildcard import
        if (node.text.includes('*')) {
          specifiers.push('*');
        }

        imports.push({
          source,
          specifiers,
          isDefault: false,
          isDynamic: false,
          line: node.startPosition.row + 1
        });
      }
    }
  }

  return imports;
}

export function extractPythonFunctions(tree: TreeSitterTree): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const root = tree.rootNode;

  const funcNodes = root.descendantsOfType('function_definition');

  for (const node of funcNodes) {
    if (!node) continue;

    // Skip methods inside classes
    const parent = node.parent;
    if (parent?.type === 'block' && parent.parent?.type === 'class_definition') continue;

    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;

    const params = node.childForFieldName('parameters');
    const parameters: string[] = [];
    if (params) {
      const paramNodes = params.descendantsOfType(['identifier', 'default_parameter', 'typed_parameter']);
      for (const p of paramNodes) {
        if (p?.type === 'identifier' && p.parent?.type === 'parameters') {
          if (p.text !== 'self' && p.text !== 'cls') {
            parameters.push(p.text);
          }
        }
      }
    }

    // Check for async
    const isAsync = node.children.some((c: TreeSitterNode) => c?.type === 'async');

    functions.push({
      name: nameNode.text,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      isAsync,
      isExported: !nameNode.text.startsWith('_'), // Python convention
      parameters,
      calls: []
    });
  }

  return functions;
}

export function extractPythonClasses(tree: TreeSitterTree): ClassInfo[] {
  const classes: ClassInfo[] = [];
  const root = tree.rootNode;

  const classNodes = root.descendantsOfType('class_definition');

  for (const node of classNodes) {
    if (!node) continue;

    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;

    // Get superclass
    const superclass = node.childForFieldName('superclasses');
    let extendsClass: string | undefined;
    if (superclass) {
      const firstBase = superclass.children.find((c: TreeSitterNode) => c?.type === 'identifier' || c?.type === 'attribute');
      if (firstBase) extendsClass = firstBase.text;
    }

    // Get methods
    const body = node.childForFieldName('body');
    const methods: string[] = [];
    if (body) {
      const methodNodes = body.descendantsOfType('function_definition');
      for (const m of methodNodes) {
        if (m) {
          const methodName = m.childForFieldName('name');
          if (methodName && !methodName.text.startsWith('__')) {
            methods.push(methodName.text);
          }
        }
      }
    }

    classes.push({
      name: nameNode.text,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      isExported: !nameNode.text.startsWith('_'),
      extends: extendsClass,
      methods
    });
  }

  return classes;
}

// =============================================================================
// Go Extractor
// =============================================================================

export function extractGoImports(tree: TreeSitterTree): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const root = tree.rootNode;

  const importNodes = root.descendantsOfType(['import_declaration', 'import_spec']);

  for (const node of importNodes) {
    if (!node) continue;

    if (node.type === 'import_spec') {
      const pathNode = node.childForFieldName('path');
      if (pathNode) {
        const source = pathNode.text.replace(/"/g, '');
        const alias = node.childForFieldName('name');

        imports.push({
          source,
          specifiers: alias ? [alias.text] : [source.split('/').pop() || source],
          isDefault: false,
          isDynamic: false,
          line: node.startPosition.row + 1
        });
      }
    }
  }

  return imports;
}

export function extractGoFunctions(tree: TreeSitterTree): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const root = tree.rootNode;

  const funcNodes = root.descendantsOfType(['function_declaration', 'method_declaration']);

  for (const node of funcNodes) {
    if (!node) continue;

    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;

    const params = node.childForFieldName('parameters');
    const parameters: string[] = [];
    if (params) {
      const paramNodes = params.descendantsOfType('parameter_declaration');
      for (const p of paramNodes) {
        if (p) {
          const names = p.descendantsOfType('identifier');
          for (const n of names) {
            if (n && n.parent?.type === 'parameter_declaration') {
              parameters.push(n.text);
            }
          }
        }
      }
    }

    // In Go, exported = starts with uppercase
    const isExported = /^[A-Z]/.test(nameNode.text);

    functions.push({
      name: nameNode.text,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      isAsync: false,
      isExported,
      parameters,
      calls: []
    });
  }

  return functions;
}

export function extractGoClasses(tree: TreeSitterTree): ClassInfo[] {
  // Go uses structs and interfaces instead of classes
  const classes: ClassInfo[] = [];
  const root = tree.rootNode;

  const typeNodes = root.descendantsOfType('type_declaration');

  for (const node of typeNodes) {
    if (!node) continue;

    const spec = node.children.find((c: TreeSitterNode) => c?.type === 'type_spec');
    if (!spec) continue;

    const nameNode = spec.childForFieldName('name');
    if (!nameNode) continue;

    const typeNode = spec.childForFieldName('type');
    if (!typeNode) continue;

    // Only include structs and interfaces
    if (typeNode.type !== 'struct_type' && typeNode.type !== 'interface_type') continue;

    const isExported = /^[A-Z]/.test(nameNode.text);

    // Get methods (for interfaces)
    const methods: string[] = [];
    if (typeNode.type === 'interface_type') {
      const methodSpecs = typeNode.descendantsOfType('method_spec');
      for (const m of methodSpecs) {
        if (m) {
          const methodName = m.childForFieldName('name');
          if (methodName) methods.push(methodName.text);
        }
      }
    }

    classes.push({
      name: nameNode.text,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      isExported,
      methods
    });
  }

  return classes;
}

// =============================================================================
// Rust Extractor
// =============================================================================

export function extractRustImports(tree: TreeSitterTree): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const root = tree.rootNode;

  const useNodes = root.descendantsOfType('use_declaration');

  for (const node of useNodes) {
    if (!node) continue;

    const argument = node.childForFieldName('argument');
    if (argument) {
      imports.push({
        source: argument.text,
        specifiers: [],
        isDefault: false,
        isDynamic: false,
        line: node.startPosition.row + 1
      });
    }
  }

  return imports;
}

export function extractRustFunctions(tree: TreeSitterTree): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const root = tree.rootNode;

  const funcNodes = root.descendantsOfType('function_item');

  for (const node of funcNodes) {
    if (!node) continue;

    // Skip methods inside impl blocks
    const parent = node.parent;
    if (parent?.type === 'impl_item') continue;

    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;

    const params = node.childForFieldName('parameters');
    const parameters: string[] = [];
    if (params) {
      const paramNodes = params.descendantsOfType('parameter');
      for (const p of paramNodes) {
        if (p) {
          const pattern = p.childForFieldName('pattern');
          if (pattern) parameters.push(pattern.text);
        }
      }
    }

    // Check for pub
    const isExported = node.children.some((c: TreeSitterNode) => c?.type === 'visibility_modifier');

    // Check for async
    const isAsync = node.children.some((c: TreeSitterNode) => c?.type === 'async');

    functions.push({
      name: nameNode.text,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      isAsync,
      isExported,
      parameters,
      calls: []
    });
  }

  return functions;
}

export function extractRustClasses(tree: TreeSitterTree): ClassInfo[] {
  // Rust uses structs, enums, and traits
  const classes: ClassInfo[] = [];
  const root = tree.rootNode;

  const structNodes = root.descendantsOfType(['struct_item', 'enum_item', 'trait_item']);

  for (const node of structNodes) {
    if (!node) continue;

    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;

    const isExported = node.children.some((c: TreeSitterNode) => c?.type === 'visibility_modifier');

    classes.push({
      name: nameNode.text,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      isExported,
      methods: []
    });
  }

  return classes;
}

// =============================================================================
// Generic Extractor (fallback for other languages)
// =============================================================================

export function extractGenericImports(tree: TreeSitterTree): ImportInfo[] {
  // Try common patterns
  const imports: ImportInfo[] = [];
  const root = tree.rootNode;

  // Look for nodes that might be imports
  const possibleImports = root.descendantsOfType([
    'import_statement',
    'import_declaration',
    'use_declaration',
    'require_call'
  ]);

  for (const node of possibleImports) {
    if (!node) continue;

    // Try to extract source from string literals
    const strings = node.descendantsOfType(['string', 'string_literal']);
    for (const s of strings) {
      if (s) {
        imports.push({
          source: s.text.replace(/['"]/g, ''),
          specifiers: [],
          isDefault: false,
          isDynamic: false,
          line: node.startPosition.row + 1
        });
      }
    }
  }

  return imports;
}

export function extractGenericFunctions(tree: TreeSitterTree): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const root = tree.rootNode;

  // Look for common function patterns
  const funcTypes = [
    'function_declaration',
    'function_definition',
    'method_declaration',
    'method_definition',
    'function_item'
  ];

  const funcNodes = root.descendantsOfType(funcTypes);

  for (const node of funcNodes) {
    if (!node) continue;

    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;

    functions.push({
      name: nameNode.text,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      isAsync: false,
      isExported: true,
      parameters: [],
      calls: []
    });
  }

  return functions;
}

export function extractGenericClasses(tree: TreeSitterTree): ClassInfo[] {
  const classes: ClassInfo[] = [];
  const root = tree.rootNode;

  // Look for common class/struct patterns
  const classTypes = [
    'class_declaration',
    'class_definition',
    'struct_item',
    'struct_declaration',
    'interface_declaration'
  ];

  const classNodes = root.descendantsOfType(classTypes);

  for (const node of classNodes) {
    if (!node) continue;

    const nameNode = node.childForFieldName('name');
    if (!nameNode) continue;

    classes.push({
      name: nameNode.text,
      line: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      isExported: true,
      methods: []
    });
  }

  return classes;
}
