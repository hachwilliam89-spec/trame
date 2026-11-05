import { readProgress } from './progress-stream';
const id = '0190f0a0-0000-7000-8000-000000000001';
const runId = '0190f0a0-0000-7000-8000-000000000002';
const event = {
  id,
  runId,
  sequence: 1,
  occurredAt: '2026-11-05T10:00:00Z',
  report: { kind: 'STARTED' },
};
function response(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
describe('Lecture de progression SSE', () => {
  it('reconstitue les fragments, ignore les commentaires et reçoit un événement validé', async () => {
    const receive = vi.fn();
    const text = `: keepalive\r\n\r\nid: ${id}\r\nevent: diagnostic\r\ndata: ${JSON.stringify(event)}\r\n\r\n`;
    await readProgress(response([...text]), runId, receive);
    expect(receive).toHaveBeenCalledExactlyOnceWith(event);
  });
  it('refuse une progression étrangère et un identifiant de trame différent', async () => {
    const receive = vi.fn();
    const frame = (body: object) =>
      response([`id: ${id}\nevent: diagnostic\ndata: ${JSON.stringify(body)}\n\n`]);
    await expect(readProgress(frame({ ...event, runId: id }), runId, receive)).rejects.toThrow();
    await expect(readProgress(frame({ ...event, id: runId }), runId, receive)).rejects.toThrow();
    expect(receive).not.toHaveBeenCalled();
  });
  it('n’invente pas d’événement pour une trame incomplète et refuse le mauvais type HTTP', async () => {
    const receive = vi.fn();
    await readProgress(response([`id: ${id}\ndata: {`]), runId, receive);
    expect(receive).not.toHaveBeenCalled();
    await expect(readProgress(new Response('<html>'), runId, receive)).rejects.toThrow();
  });
});
