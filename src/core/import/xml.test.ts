import {
  child, childrenNamed, numberOf, parseXml, textOf,
  XmlError, XmlSecurityError, DEFAULT_XML_LIMITS,
} from './xml';

describe('lettura di base', () => {
  it('legge elementi annidati, attributi e testo', () => {
    const radice = parseXml('<a x="1"><b>ciao</b><b>mondo</b></a>');
    expect(radice.name).toBe('a');
    expect(radice.attrs.x).toBe('1');
    expect(childrenNamed(radice, 'b').map((e) => e.text)).toEqual(['ciao', 'mondo']);
  });

  it('accetta i tag autochiusi', () => {
    const radice = parseXml('<a><b n="2"/><c/></a>');
    expect(radice.children.map((c) => c.name)).toEqual(['b', 'c']);
    expect(child(radice, 'b')?.attrs.n).toBe('2');
  });

  it('salta dichiarazione, commenti e istruzioni di elaborazione', () => {
    const radice = parseXml('<?xml version="1.0"?><!-- nota --><a><?pi dati?><b>1</b></a>');
    expect(numberOf(radice, 'b')).toBe(1);
  });

  it('legge il CDATA alla lettera', () => {
    const radice = parseXml('<a><![CDATA[1 < 2 & 3 > 2]]></a>');
    expect(radice.text).toBe('1 < 2 & 3 > 2');
  });

  it('decodifica le entità predefinite e i riferimenti numerici', () => {
    const radice = parseXml('<a>&lt;p&gt; &amp; &quot;x&quot; &#65; &#x42;</a>');
    expect(radice.text).toBe('<p> & "x" A B');
  });

  it('accetta gli apici singoli negli attributi', () => {
    expect(parseXml("<a t='un valore'/>").attrs.t).toBe('un valore');
  });

  it('non si ferma su un > dentro un attributo', () => {
    expect(parseXml('<a t="2 > 1"><b/></a>').children).toHaveLength(1);
  });

  it('accetta un DOCTYPE innocuo', () => {
    expect(parseXml('<!DOCTYPE score-partwise><a><b>1</b></a>').name).toBe('a');
  });
});

describe('documenti rotti', () => {
  it('rifiuta un documento vuoto', () => {
    expect(() => parseXml('   ')).toThrow(XmlError);
  });

  it('rifiuta un documento troncato', () => {
    expect(() => parseXml('<a><b>cia')).toThrow(/finisce prima di chiudere/);
  });

  it('rifiuta un tag non chiuso', () => {
    expect(() => parseXml('<a><b')).toThrow(XmlError);
  });

  it('rifiuta una chiusura che non corrisponde', () => {
    expect(() => parseXml('<a><b></c></a>')).toThrow(/non corrisponde/);
  });

  it('rifiuta una chiusura senza apertura', () => {
    expect(() => parseXml('<a></a></b>')).toThrow(XmlError);
  });

  it('rifiuta due elementi radice', () => {
    expect(() => parseXml('<a/><b/>')).toThrow(/radice/);
  });

  it('rifiuta un commento non chiuso', () => {
    expect(() => parseXml('<a><!-- aperto </a>')).toThrow(XmlError);
  });
});

describe('sicurezza', () => {
  it('rifiuta le entità personalizzate invece di risolverle', () => {
    // È la forma classica dell'attacco XXE: entità che punta a un file.
    const attacco =
      '<!DOCTYPE a [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><a>&xxe;</a>';
    expect(() => parseXml(attacco)).toThrow(XmlSecurityError);
  });

  it('rifiuta un DOCTYPE che punta a un file esterno', () => {
    expect(() => parseXml('<!DOCTYPE a SYSTEM "http://esempio/a.dtd"><a/>'))
      .toThrow(XmlSecurityError);
  });

  it('rifiuta un DTD pubblico esterno', () => {
    expect(() => parseXml('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD" "partwise.dtd"><a/>'))
      .toThrow(XmlSecurityError);
  });

  it('rifiuta un entità non dichiarata anche senza DOCTYPE', () => {
    // Senza questa regola resterebbe una strada per farne risolvere una.
    expect(() => parseXml('<a>&qualcosa;</a>')).toThrow(XmlSecurityError);
  });

  it('non espande le entità ricorsive, perché non ne espande nessuna', () => {
    // "Billion laughs": senza espansione di entità non ha alcun effetto.
    const bomba =
      '<!DOCTYPE a [<!ENTITY a "xx"><!ENTITY b "&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;">]><a>&c;</a>';
    expect(() => parseXml(bomba)).toThrow(XmlSecurityError);
  });

  it('rifiuta un documento oltre il limite di dimensione', () => {
    const enorme = `<a>${'x'.repeat(40)}</a>`;
    expect(() => parseXml(enorme, { ...DEFAULT_XML_LIMITS, maxLength: 20 }))
      .toThrow(/troppo grande/);
  });

  it('rifiuta un documento annidato troppo in profondità', () => {
    const profondo = '<a>'.repeat(50) + '</a>'.repeat(50);
    expect(() => parseXml(profondo, { ...DEFAULT_XML_LIMITS, maxDepth: 10 }))
      .toThrow(/profondità/);
  });

  it('rifiuta un documento con troppi elementi', () => {
    const molti = `<a>${'<b/>'.repeat(50)}</a>`;
    expect(() => parseXml(molti, { ...DEFAULT_XML_LIMITS, maxNodes: 20 }))
      .toThrow(/troppi elementi/);
  });

  it('rifiuta un elemento con troppi attributi', () => {
    const attributi = Array.from({ length: 40 }, (_, i) => `a${i}="1"`).join(' ');
    expect(() => parseXml(`<a ${attributi}/>`, { ...DEFAULT_XML_LIMITS, maxAttributes: 10 }))
      .toThrow(/troppi attributi/);
  });
});

describe('navigazione', () => {
  const radice = parseXml('<a><b>1</b><b>2</b><c><d>testo</d></c><vuoto></vuoto></a>');

  it('trova il primo figlio con quel nome', () => {
    expect(textOf(radice, 'b')).toBe('1');
  });

  it('trova tutti i figli con quel nome', () => {
    expect(childrenNamed(radice, 'b')).toHaveLength(2);
  });

  it('legge un numero', () => {
    expect(numberOf(radice, 'b')).toBe(1);
    expect(numberOf(radice, 'manca')).toBeNull();
  });

  it('restituisce null per un elemento senza testo', () => {
    expect(textOf(radice, 'vuoto')).toBeNull();
  });

  it('non esplode su un elemento assente', () => {
    expect(child(null, 'x')).toBeNull();
    expect(textOf(undefined, 'x')).toBeNull();
  });
});
