import { describe, expect, it } from 'vitest';
import { annotatedPhotoUrl, pickPrimaryPhotoUri } from './annotated-photo';

describe('annotatedPhotoUrl', () => {
  it('builds <base>/photos/<sha>.jpg?annotated=1', () => {
    expect(annotatedPhotoUrl('http://192.168.1.5:14000', 'abc123')).toBe(
      'http://192.168.1.5:14000/photos/abc123.jpg?annotated=1',
    );
  });

  it('trims trailing slashes on the base so the path never doubles up', () => {
    expect(annotatedPhotoUrl('http://host:14000/', 'abc')).toBe(
      'http://host:14000/photos/abc.jpg?annotated=1',
    );
    expect(annotatedPhotoUrl('http://host:14000///', 'abc')).toBe(
      'http://host:14000/photos/abc.jpg?annotated=1',
    );
  });

  it('trims stray whitespace', () => {
    expect(annotatedPhotoUrl(' http://host ', ' abc ')).toBe(
      'http://host/photos/abc.jpg?annotated=1',
    );
  });
});

describe('pickPrimaryPhotoUri', () => {
  it('prefers the annotated render when the download succeeded', () => {
    expect(pickPrimaryPhotoUri('file:///cache/annotated_x.jpg', 'file:///raw.jpg')).toBe(
      'file:///cache/annotated_x.jpg',
    );
  });

  it('falls back to the raw capture on 404/failure (null annotated)', () => {
    expect(pickPrimaryPhotoUri(null, 'file:///raw.jpg')).toBe('file:///raw.jpg');
  });

  it('falls back even when the raw uri is itself missing (caller guards)', () => {
    expect(pickPrimaryPhotoUri(null, undefined)).toBeUndefined();
  });
});
