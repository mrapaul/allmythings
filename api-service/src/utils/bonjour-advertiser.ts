import Bonjour from 'bonjour-service';

export function advertiseService(port: number): () => void {
  const bonjour = new Bonjour();
  bonjour.publish({ name: 'allmythings-server', type: 'http', port });
  return () => bonjour.destroy();
}
