import { render } from '@testing-library/react-native';
import { describe, expect, it } from 'vitest';
import { DetectionRow } from './DetectionRow';

const noop = () => undefined;

describe('DetectionRow', () => {
  it('renders pending row without throwing', () => {
    const tree = render(
      <DetectionRow
        photoUri="file:///fake.jpg"
        imageWidth={1280}
        imageHeight={960}
        box={{ x: 0.1, y: 0.1, width: 0.4, height: 0.4 }}
        tags={['Sofa']}
        status="pending"
        index={0}
        onChangeTag={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onToggleSave={noop}
        onDiscard={noop}
      />,
    ).toJSON();
    expect(tree).toBeTruthy();
  });

  it('renders saved row without throwing', () => {
    const tree = render(
      <DetectionRow
        photoUri="file:///fake.jpg"
        imageWidth={1280}
        imageHeight={960}
        box={{ x: 0, y: 0, width: 0.5, height: 0.5 }}
        tags={['Sofa', 'leather']}
        status="saved"
        isSaving={false}
        index={1}
        onChangeTag={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onToggleSave={noop}
        onDiscard={noop}
      />,
    ).toJSON();
    expect(tree).toBeTruthy();
  });
});
