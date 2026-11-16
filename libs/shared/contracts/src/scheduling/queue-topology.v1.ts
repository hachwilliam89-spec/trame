import { z } from 'zod';

/** Une file durable de RabbitMQ, sa clé de routage et ses arguments de déclaration. */
export const queueDeclarationV1 = z.object({
  name: z.string().min(1),
  routingKey: z.string().min(1),
  arguments: z.record(z.string(), z.union([z.string(), z.int(), z.boolean()])),
});

/**
 * Topologie d'un échange de travail entre l'API et le moteur : demandes, rapports, lettres mortes
 * et quarantaine. Chaque échange (diagnostic, génération) a la sienne, de même forme.
 */
export function queueTopology() {
  return z.object({
    exchange: z.string().min(1),
    requests: queueDeclarationV1,
    reports: queueDeclarationV1,
    deadLetters: queueDeclarationV1,
    parking: queueDeclarationV1,
  });
}
