import { imageCompose } from './lib/image-stack';

it('isole les images construites par deux exécutions sur le même démon Docker', async () => {
  const references: string[][] = [];
  for (const project of ['trame-images-proof-one', 'trame-images-proof-two']) {
    const config = JSON.parse(
      await imageCompose({ project, webPort: 14200, keycloakPort: 18080 }, [
        'config',
        '--format',
        'json',
      ]),
    );
    const images: string[] = [];
    for (const name of ['api', 'relay', 'engine', 'worker', 'web', 'migrator']) {
      images.push(config.services[name].image);
    }
    expect(images.every((image) => image.startsWith(project + '-'))).toBe(true);
    references.push(images);
  }
  expect(references[0]?.some((image) => references[1]?.includes(image))).toBe(false);
});
