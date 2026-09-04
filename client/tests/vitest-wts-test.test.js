import { describe, it } from 'vitest';
import * as wts from 'web-tree-sitter';
import Parser from 'web-tree-sitter';
import { Parser as NamedParser } from 'web-tree-sitter';

describe('web-tree-sitter exports', () => {
  it('should print', () => {
    console.log('wts keys:', Object.keys(wts));
    console.log('wts.init:', typeof wts.init);
    console.log('Parser keys:', Parser ? Object.keys(Parser) : 'undefined');
    console.log('Parser.init:', Parser && typeof Parser.init);
    console.log('NamedParser keys:', NamedParser ? Object.keys(NamedParser) : 'undefined');
    console.log('NamedParser.init:', NamedParser && typeof NamedParser.init);
  });
});
