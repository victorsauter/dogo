import { convertFormDataAsync } from 'expo/src/winter/fetch/convertFormData';

import { photoForm } from '../photoUpload';

const photo = {
  uri: 'file:///cache/ImageManipulator/abc.jpg',
  name: 'photo.jpg',
  type: 'image/jpeg',
};

/** The native `File` implements `Blob` without extending it (as on Hermes). */
function blobLike(name: string, type: string, bytes: number[]) {
  return {
    name,
    type,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
    bytes: async () => new Uint8Array(bytes),
  };
}

describe('photoForm', () => {
  it('sends the photo as a file part named "file"', async () => {
    const part = photoForm(photo).get('file');
    expect(part).toBeInstanceOf(Blob);
    const file = part as File;
    expect(file.name).toBe('photo.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual([0xff, 0xd8, 0xff, 0xe0]);
  });
});

describe('expo/fetch multipart encoding (SDK 58)', () => {
  const decode = (body: Uint8Array) => new TextDecoder().decode(body);

  it('encodes a Blob-like file part with its file name and type', async () => {
    const form = { entries: () => [['file', blobLike('photo.jpg', 'image/jpeg', [0x41, 0x42])]] };
    const { body, boundary } = await convertFormDataAsync(form as unknown as FormData, 'B');
    expect(boundary).toBe('B');
    expect(decode(body)).toBe(
      '--B\r\ncontent-disposition: form-data; name="file"; filename="photo.jpg"\r\n' +
        'content-type: image/jpeg\r\n\r\nAB\r\n--B--\r\n',
    );
  });

  it('rejects the React Native { uri, name, type } part the app used to send (defect D1)', async () => {
    const form = {
      entries: () => [['file', { uri: photo.uri, name: 'photo.jpg', type: 'image/jpeg' }]],
    };
    await expect(convertFormDataAsync(form as unknown as FormData)).rejects.toThrow(
      'Unsupported FormDataPart implementation',
    );
  });
});
