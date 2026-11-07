import {
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  MP4,
  Output,
} from 'mediabunny';

export async function remuxSunoAac(video: Blob, signal: AbortSignal) {
  signal.throwIfAborted();
  const input = new Input({ source: new BlobSource(video), formats: [MP4] });
  const dispose = () => input.dispose();
  signal.addEventListener('abort', dispose, { once: true });
  try {
    const track = (await input.getAudioTracks())[0];
    if (!track || (await track.getCodec()) !== 'aac') return null;
    const decoderConfig = await track.getDecoderConfig();
    if (!decoderConfig) return null;

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const audio = new EncodedAudioPacketSource('aac');
    output.addAudioTrack(audio);
    await output.start();
    try {
      let first = true;
      for await (const packet of new EncodedPacketSink(track).packets()) {
        signal.throwIfAborted();
        await audio.add(packet, first ? { decoderConfig } : undefined);
        first = false;
      }
      if (first) throw new Error('视频没有可保存的音轨。');
      await output.finalize();
      signal.throwIfAborted();
      return new Blob([target.buffer!], { type: 'audio/mp4' });
    } catch (error) {
      await output.cancel().catch(() => {});
      throw error;
    }
  } finally {
    signal.removeEventListener('abort', dispose);
    dispose();
  }
}
