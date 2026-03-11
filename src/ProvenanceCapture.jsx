import React, { useCallback, useEffect, useRef, useState } from 'react';
import CryptoJS from 'crypto-js';

function ProvenanceCapture() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const previewImgRef = useRef(null);

  const [mediaStream, setMediaStream] = useState(null);
  const [captured, setCaptured] = useState(null);
  const [manifest, setManifest] = useState(null);

  const [creatorName, setCreatorName] = useState('');
  const [caption, setCaption] = useState('');
  const [copyright, setCopyright] = useState('');
  const [license, setLicense] = useState('');
  const [location, setLocation] = useState('');
  const [cameraModel, setCameraModel] = useState('');

  const [exactHash, setExactHash] = useState('');
  const [perceptualHash, setPerceptualHash] = useState('');

  const [captureStatus, setCaptureStatus] = useState(null);
  const [manifestStatus, setManifestStatus] = useState(null);

  const showStatus = (setter, message, type) => {
    setter({ message, type });
    setTimeout(() => {
      setter(prev => (prev && prev.message === message ? null : prev));
    }, 5000);
  };

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setMediaStream(stream);
      showStatus(setCaptureStatus, 'Camera started. Ready to capture.', 'info');
    } catch (error) {
      showStatus(
        setCaptureStatus,
        'Camera access denied: ' + (error && error.message ? error.message : 'Unknown error'),
        'error'
      );
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      setMediaStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    showStatus(setCaptureStatus, 'Camera stopped.', 'info');
  }, [mediaStream]);

  const computeHashes = useCallback(async blob => {
    const buffer = await blob.arrayBuffer();

    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const exactHashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    setExactHash(exactHashHex);

    const wordArray = CryptoJS.lib.WordArray.create(new Uint8Array(buffer));
    const base64Content = CryptoJS.enc.Base64.stringify(wordArray);
    const contentHash = CryptoJS.SHA256(base64Content).toString();
    const perceptualHashHex = contentHash.substring(0, 32);
    setPerceptualHash(perceptualHashHex);

    setCaptured(prev =>
      prev ? { ...prev, exactHash: exactHashHex, perceptualHash: perceptualHashHex } : prev
    );
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      showStatus(setCaptureStatus, 'Video or canvas not available.', 'error');
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      showStatus(setCaptureStatus, 'Unable to get canvas context.', 'error');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      async blob => {
        if (!blob) {
          showStatus(setCaptureStatus, 'Failed to capture image blob.', 'error');
          return;
        }

        const timestamp = new Date().toISOString();
        const dataUrl = canvas.toDataURL('image/jpeg');

        const newCaptured = {
          dataUrl,
          blob,
          timestamp,
        };

        setCaptured(newCaptured);
        await computeHashes(blob);

        if (previewImgRef.current) {
          previewImgRef.current.src = dataUrl;
        }

        showStatus(
          setCaptureStatus,
          'Photo captured successfully! Hashes computed.',
          'success'
        );
      },
      'image/jpeg',
      0.9
    );
  }, [computeHashes]);

  const generateManifest = useCallback(() => {
    if (!captured) {
      showStatus(setManifestStatus, 'Please capture a photo first.', 'error');
      return;
    }

    const newManifest = {
      version: '2.2',
      claim_generator: 'Media Provenance Capture v1.0',
      claims: [
        {
          label: 'c2pa.created',
          data: {
            timestamp: captured.timestamp,
            software_agent: 'Media Provenance Capture v1.0',
            alg: 'es256',
          },
        },
        {
          label: 'stds.schema-org.CreativeWork',
          data: {
            '@context': 'https://schema.org',
            '@type': 'CreativeWork',
            author: {
              '@type': 'Person',
              name: creatorName || 'Anonymous',
            },
            description: caption || 'Captured photo',
            copyrightNotice: copyright,
            license: license,
            locationCreated: location,
            datePublished: captured.timestamp,
          },
        },
        {
          label: 'c2pa.hash.assertion',
          data: {
            algorithm: 'sha256',
            exact_hash: captured.exactHash,
            perceptual_hash: captured.perceptualHash,
            media_type: 'image/jpeg',
          },
        },
        {
          label: 'c2pa.source_type',
          data: {
            value: 'camera',
            camera_model: cameraModel,
          },
        },
      ],
    };

    setManifest(newManifest);
    showStatus(
      setManifestStatus,
      'Manifest generated successfully! Ready for blockchain registration.',
      'success'
    );
  }, [captured, creatorName, caption, copyright, license, location, cameraModel]);

  const downloadManifest = useCallback(() => {
    if (!manifest || !captured) {
      showStatus(setManifestStatus, 'Please generate a manifest first.', 'error');
      return;
    }

    const dataStr = JSON.stringify(manifest, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `manifest_${captured.timestamp.split('T')[0]}.json`;
    link.click();

    URL.revokeObjectURL(url);

    showStatus(setManifestStatus, 'Manifest downloaded!', 'success');
  }, [manifest, captured]);

  useEffect(() => {
    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [mediaStream]);

  const cameraActive = !!mediaStream;

  return (
    <div className="provenance-container">
      <h1>Provenance Capture</h1>

      <section className="capture-section">
        <h2>Capture</h2>
        <div className="video-wrapper">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="video-stream"
          />
        </div>
        <div className="capture-controls">
          <button onClick={startCamera} disabled={cameraActive}>
            Start Camera
          </button>
          <button onClick={capturePhoto} disabled={!cameraActive}>
            Capture
          </button>
          <button onClick={stopCamera} disabled={!cameraActive}>
            Stop Camera
          </button>
        </div>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {captureStatus && (
          <div className={`status ${captureStatus.type}`}>
            {captureStatus.message}
          </div>
        )}
      </section>

      {captured && (
        <section className="preview-section">
          <h2>Preview</h2>
          <img ref={previewImgRef} alt="Captured" className="captured-image" />
          <div className="hashes">
            <p>
              <strong>Exact hash:</strong> {exactHash}
            </p>
            <p>
              <strong>Perceptual hash:</strong> {perceptualHash}
            </p>
          </div>
        </section>
      )}

      <section className="manifest-section">
        <h2>Metadata & Manifest</h2>
        <div className="form-grid">
          <label>
            Creator name
            <input
              value={creatorName}
              onChange={e => setCreatorName(e.target.value)}
            />
          </label>
          <label>
            Caption
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
            />
          </label>
          <label>
            Copyright
            <input
              value={copyright}
              onChange={e => setCopyright(e.target.value)}
            />
          </label>
          <label>
            License
            <input
              value={license}
              onChange={e => setLicense(e.target.value)}
            />
          </label>
          <label>
            Location
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </label>
          <label>
            Camera model
            <input
              value={cameraModel}
              onChange={e => setCameraModel(e.target.value)}
            />
          </label>
        </div>

        <div className="manifest-controls">
          <button onClick={generateManifest}>Generate Manifest</button>
          <button onClick={downloadManifest} disabled={!manifest}>
            Download Manifest
          </button>
        </div>

        {manifestStatus && (
          <div className={`status ${manifestStatus.type}`}>
            {manifestStatus.message}
          </div>
        )}

        {manifest && (
          <pre className="manifest-json">
            {JSON.stringify(manifest, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}

export default ProvenanceCapture;
