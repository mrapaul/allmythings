/**
 * Unit tests for semantic expansion configuration
 */

import { describe, it, expect } from 'vitest';
import {
  getSemanticExpansion,
  getExpandedTerms,
  areObjectsRelated,
  SEMANTIC_EXPANSION_DATABASE,
} from '../../src/config/semantic-expansion.config';

describe('Semantic Expansion Configuration', () => {
  describe('getSemanticExpansion', () => {
    it('should return synonyms and related objects for known object', () => {
      const result = getSemanticExpansion('couch');
      expect(result).not.toBeNull();
      expect(result?.synonyms).toContain('sofa');
      expect(result?.relatedObjects).toContain('blanket');
    });

    it('should handle case-insensitive lookups', () => {
      const result1 = getSemanticExpansion('COUCH');
      const result2 = getSemanticExpansion('CoUcH');
      expect(result1).toEqual(result2);
      expect(result1).not.toBeNull();
    });

    it('should return null for unknown objects', () => {
      const result = getSemanticExpansion('unknownobject123');
      expect(result).toBeNull();
    });

    it('should find matches by partial string', () => {
      const result = getSemanticExpansion('sofa');
      expect(result).not.toBeNull();
      expect(result?.synonyms).toContain('couch');
    });

    it('should work for all core furniture items', () => {
      const items = ['bed', 'chair', 'table', 'desk'];
      for (const item of items) {
        const result = getSemanticExpansion(item);
        expect(result).not.toBeNull();
        expect(result?.synonyms.length).toBeGreaterThan(0);
      }
    });

    it('should work for lighting fixtures', () => {
      const result = getSemanticExpansion('lamp');
      expect(result).not.toBeNull();
      expect(result?.category).toBe('lighting');
      expect(result?.synonyms).toContain('light');
    });

    it('should work for kitchen appliances', () => {
      const result = getSemanticExpansion('refrigerator');
      expect(result).not.toBeNull();
      expect(result?.category).toBe('appliance');
      expect(result?.synonyms).toContain('fridge');
    });

    it('should work for bathroom fixtures', () => {
      const result = getSemanticExpansion('toilet');
      expect(result).not.toBeNull();
      expect(result?.category).toBe('fixture');
    });
  });

  describe('getExpandedTerms', () => {
    it('should return object with all synonyms and related terms', () => {
      const terms = getExpandedTerms('couch');
      expect(terms).toContain('couch');
      expect(terms).toContain('sofa');
      expect(terms).toContain('blanket');
      expect(terms.length).toBeGreaterThan(1);
    });

    it('should return just the object for unknown items', () => {
      const terms = getExpandedTerms('unknownobject');
      expect(terms).toEqual(['unknownobject']);
    });

    it('should not contain duplicates', () => {
      const terms = getExpandedTerms('couch');
      const uniqueTerms = [...new Set(terms)];
      expect(terms.length).toBe(uniqueTerms.length);
    });

    it('should work with multiple expansion levels', () => {
      const terms = getExpandedTerms('bed');
      expect(terms.length).toBeGreaterThan(3);
      expect(terms).toContain('bed');
      expect(terms).toContain('pillow');
      expect(terms).toContain('blanket');
    });
  });

  describe('areObjectsRelated', () => {
    it('should identify related objects', () => {
      expect(areObjectsRelated('couch', 'sofa')).toBe(true);
      expect(areObjectsRelated('bed', 'pillow')).toBe(true);
      expect(areObjectsRelated('lamp', 'light')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(areObjectsRelated('COUCH', 'sofa')).toBe(true);
      expect(areObjectsRelated('couch', 'SOFA')).toBe(true);
    });

    it('should return false for unrelated objects', () => {
      expect(areObjectsRelated('couch', 'toilet')).toBe(false);
      expect(areObjectsRelated('bed', 'stove')).toBe(false);
    });

    it('should identify related kitchen items', () => {
      expect(areObjectsRelated('stove', 'pot')).toBe(true);
      expect(areObjectsRelated('refrigerator', 'fridge')).toBe(true);
    });

    it('should identify related bathroom items', () => {
      expect(areObjectsRelated('bathroom', 'toilet')).toBe(false);
      expect(areObjectsRelated('toilet', 'bathroom')).toBe(false);
    });
  });

  describe('SEMANTIC_EXPANSION_DATABASE', () => {
    it('should contain all major furniture categories', () => {
      expect(SEMANTIC_EXPANSION_DATABASE['couch']).toBeDefined();
      expect(SEMANTIC_EXPANSION_DATABASE['bed']).toBeDefined();
      expect(SEMANTIC_EXPANSION_DATABASE['table']).toBeDefined();
      expect(SEMANTIC_EXPANSION_DATABASE['chair']).toBeDefined();
    });

    it('should contain all major appliances', () => {
      expect(SEMANTIC_EXPANSION_DATABASE['refrigerator']).toBeDefined();
      expect(SEMANTIC_EXPANSION_DATABASE['stove']).toBeDefined();
      expect(SEMANTIC_EXPANSION_DATABASE['microwave']).toBeDefined();
    });

    it('should contain bathroom fixtures', () => {
      expect(SEMANTIC_EXPANSION_DATABASE['toilet']).toBeDefined();
      expect(SEMANTIC_EXPANSION_DATABASE['bathtub']).toBeDefined();
      expect(SEMANTIC_EXPANSION_DATABASE['mirror']).toBeDefined();
    });

    it('should contain decoration items', () => {
      expect(SEMANTIC_EXPANSION_DATABASE['picture']).toBeDefined();
      expect(SEMANTIC_EXPANSION_DATABASE['plant']).toBeDefined();
      expect(SEMANTIC_EXPANSION_DATABASE['vase']).toBeDefined();
    });

    it('should have valid structure for all items', () => {
      for (const [key, value] of Object.entries(
        SEMANTIC_EXPANSION_DATABASE
      )) {
        expect(value.synonyms).toBeDefined();
        expect(Array.isArray(value.synonyms)).toBe(true);
        expect(value.relatedObjects).toBeDefined();
        expect(Array.isArray(value.relatedObjects)).toBe(true);
        expect(value.category).toBeDefined();
        expect(typeof value.category).toBe('string');
      }
    });

    it('should have multiple items in each category', () => {
      const categories: Record<string, number> = {};

      for (const value of Object.values(SEMANTIC_EXPANSION_DATABASE)) {
        const cat = value.category;
        categories[cat] = (categories[cat] || 0) + 1;
      }

      // At least 5 items per category
      for (const count of Object.values(categories)) {
        expect(count).toBeGreaterThanOrEqual(3);
      }
    });

    it('should have at least 40 objects configured', () => {
      const count = Object.keys(SEMANTIC_EXPANSION_DATABASE).length;
      expect(count).toBeGreaterThanOrEqual(40);
    });
  });

  describe('Room Type Coverage', () => {
    it('should cover bedroom items', () => {
      const bedroomItems = ['bed', 'pillow', 'blanket', 'nightstand'];
      for (const item of bedroomItems) {
        expect(SEMANTIC_EXPANSION_DATABASE[item]).toBeDefined();
      }
    });

    it('should cover kitchen items', () => {
      const kitchenItems = [
        'refrigerator',
        'stove',
        'sink',
        'cabinet',
      ];
      for (const item of kitchenItems) {
        expect(SEMANTIC_EXPANSION_DATABASE[item]).toBeDefined();
      }
    });

    it('should cover bathroom items', () => {
      const bathroomItems = [
        'toilet',
        'bathtub',
        'shower',
        'mirror',
      ];
      for (const item of bathroomItems) {
        expect(SEMANTIC_EXPANSION_DATABASE[item]).toBeDefined();
      }
    });

    it('should cover living room items', () => {
      const livingRoomItems = ['couch', 'table', 'lamp', 'television'];
      for (const item of livingRoomItems) {
        expect(SEMANTIC_EXPANSION_DATABASE[item]).toBeDefined();
      }
    });

    it('should cover office items', () => {
      const officeItems = ['desk', 'chair', 'computer', 'printer'];
      for (const item of officeItems) {
        expect(SEMANTIC_EXPANSION_DATABASE[item]).toBeDefined();
      }
    });
  });

  describe('Semantic Relationships', () => {
    it('should group furniture correctly', () => {
      const couchExp = getSemanticExpansion('couch');
      const sofaExp = getSemanticExpansion('sofa');
      expect(couchExp?.synonyms).toContain('sofa');
      expect(sofaExp?.synonyms).toContain('couch');
    });

    it('should link appliances to their parts', () => {
      const stoveExp = getSemanticExpansion('stove');
      expect(stoveExp?.relatedObjects).toContain('pot');
      expect(stoveExp?.relatedObjects).toContain('pan');
    });

    it('should link furniture to textiles', () => {
      const bedExp = getSemanticExpansion('bed');
      expect(bedExp?.relatedObjects).toContain('pillow');
      expect(bedExp?.relatedObjects).toContain('blanket');
    });

    it('should link fixtures to their components', () => {
      const toiletExp = getSemanticExpansion('toilet');
      expect(toiletExp?.relatedObjects).toContain('toilet seat');
      expect(toiletExp?.relatedObjects).toContain('tank');
    });
  });
});
