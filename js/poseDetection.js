/**
 * MediaPipe Pose + Hands detection module.
 * Runs fully client-side using @mediapipe/tasks-vision.
 */
export class PoseDetection {
  constructor() {
    this.poseLandmarker = null;
    this.handLandmarker = null;
    this.videoElement = null;
    this.isReady = false;
    this.lastTimestamp = -1;

    // Latest results
    this.poseResults = null;
    this.handResults = null;

    // Hand position history for velocity calc
    this.handHistory = { left: [], right: [] };
    this.maxHistory = 5;

    // Processed hand data
    this.hands = {
      left:  { x: 0, y: 0, vx: 0, vy: 0, speed: 0, visible: false },
      right: { x: 0, y: 0, vx: 0, vy: 0, speed: 0, visible: false },
    };

    // Raw hand landmarks for blade rendering (mirrored)
    this.handLandmarks = { left: null, right: null };

    // Open hand state (true = fingers extended, false = fist)
    this.handOpen = { left: false, right: false };
    this.prevHandOpen = { left: false, right: false };

    // Skeleton connections for rendering
    this.skeletonConnections = [
      [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
      [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
      [24, 26], [26, 28],
    ];
  }

  /**
   * Start webcam feed.
   */
  async startCamera(videoElement) {
    this.videoElement = videoElement;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
    this.videoElement.srcObject = stream;

    return new Promise((resolve) => {
      this.videoElement.onloadeddata = () => {
        this.videoElement.play();
        console.log('[PoseDetection] Camera started:', this.videoElement.videoWidth, 'x', this.videoElement.videoHeight);
        resolve();
      };
    });
  }

  /**
   * Initialize MediaPipe models. Call AFTER startCamera.
   */
  async init() {
    // Dynamically import the MediaPipe vision module
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');

    const { FilesetResolver, PoseLandmarker, HandLandmarker } = vision;

    const filesetResolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );

    // Initialize PoseLandmarker
    this.poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
    console.log('[PoseDetection] Pose model loaded');

    // Initialize HandLandmarker
    this.handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
    });
    console.log('[PoseDetection] Hand model loaded');

    this.isReady = true;
    console.log('[PoseDetection] All models ready');
  }

  /**
   * Run detection on current video frame.
   * @param {number} timestamp - performance.now()
   */
  detect(timestamp) {
    if (!this.isReady || !this.videoElement || this.videoElement.readyState < 2) return;

    // MediaPipe requires strictly increasing timestamps
    const ts = Math.round(timestamp);
    if (ts <= this.lastTimestamp) return;
    this.lastTimestamp = ts;

    try {
      this.poseResults = this.poseLandmarker.detectForVideo(this.videoElement, ts);
    } catch (e) {
      // skip frame on error
    }

    try {
      this.handResults = this.handLandmarker.detectForVideo(this.videoElement, ts);
    } catch (e) {
      // skip frame on error
    }

    this._processHands();
  }

  /**
   * Calculate hand positions and velocities in normalized [0,1] coords.
   */
  _processHands() {
    this.hands.left.visible = false;
    this.hands.right.visible = false;
    this.handLandmarks.left = null;
    this.handLandmarks.right = null;
    this.prevHandOpen.left = this.handOpen.left;
    this.prevHandOpen.right = this.handOpen.right;

    if (this.handResults && this.handResults.landmarks && this.handResults.landmarks.length > 0) {
      for (let i = 0; i < this.handResults.landmarks.length; i++) {
        const landmarks = this.handResults.landmarks[i];
        const handedness = this.handResults.handednesses?.[i];
        if (!handedness || !handedness[0] || !landmarks || landmarks.length === 0) continue;

        const label = handedness[0].categoryName === 'Left' ? 'left' : 'right';

        // Store mirrored landmarks for blade drawing
        this.handLandmarks[label] = landmarks.map(lm => ({
          x: 1 - lm.x,
          y: lm.y,
          z: lm.z,
        }));

        // Detect open hand vs fist
        this.handOpen[label] = this._isHandOpen(landmarks);

        const wrist = landmarks[0];
        const middleTip = landmarks[12];

        const x = 1 - (wrist.x + middleTip.x) / 2;
        const y = (wrist.y + middleTip.y) / 2;

        this._updateHandData(label, x, y);
      }
    }

    // Fallback: use pose wrist landmarks if hands not detected
    if (this.poseResults && this.poseResults.landmarks && this.poseResults.landmarks.length > 0) {
      const pose = this.poseResults.landmarks[0];

      if (!this.hands.left.visible && pose[15] && pose[15].visibility > 0.5) {
        this._updateHandData('left', 1 - pose[15].x, pose[15].y);
      }
      if (!this.hands.right.visible && pose[16] && pose[16].visibility > 0.5) {
        this._updateHandData('right', 1 - pose[16].x, pose[16].y);
      }
    }
  }

  /**
   * Detect if hand is open (fingers extended) or closed (fist).
   * Compares distance from fingertip to wrist vs knuckle (MCP) to wrist.
   * If fingertips are farther than knuckles → open. Otherwise → fist.
   * Uses raw (non-mirrored) landmarks.
   */
  _isHandOpen(lm) {
    // Finger tip indices: index=8, middle=12, ring=16, pinky=20
    // Finger MCP indices: index=5, middle=9, ring=13, pinky=17
    const wrist = lm[0];
    const tipIds = [8, 12, 16, 20];
    const mcpIds = [5, 9, 13, 17];

    let extendedCount = 0;
    for (let i = 0; i < 4; i++) {
      const tip = lm[tipIds[i]];
      const mcp = lm[mcpIds[i]];

      const tipDist = Math.sqrt(
        (tip.x - wrist.x) ** 2 + (tip.y - wrist.y) ** 2 + (tip.z - wrist.z) ** 2
      );
      const mcpDist = Math.sqrt(
        (mcp.x - wrist.x) ** 2 + (mcp.y - wrist.y) ** 2 + (mcp.z - wrist.z) ** 2
      );

      // Tip should be notably farther than MCP for finger to be "extended"
      if (tipDist > mcpDist * 1.15) {
        extendedCount++;
      }
    }

    // At least 3 of 4 fingers extended = open hand
    return extendedCount >= 3;
  }

  _updateHandData(label, x, y) {
    const now = performance.now();
    const history = this.handHistory[label];
    history.push({ x, y, t: now });

    if (history.length > this.maxHistory) {
      history.shift();
    }

    const hand = this.hands[label];
    hand.x = x;
    hand.y = y;
    hand.visible = true;

    if (history.length >= 2) {
      const oldest = history[0];
      const dt = (now - oldest.t) / 1000;
      if (dt > 0.001) {
        hand.vx = (x - oldest.x) / dt;
        hand.vy = (y - oldest.y) / dt;
        hand.speed = Math.sqrt(hand.vx * hand.vx + hand.vy * hand.vy);
      }
    }
  }

  getPoseLandmarks() {
    if (this.poseResults && this.poseResults.landmarks && this.poseResults.landmarks.length > 0) {
      // Return mirrored landmarks so skeleton renders correctly
      return this.poseResults.landmarks[0].map(lm => ({
        x: 1 - lm.x,
        y: lm.y,
        z: lm.z,
        visibility: lm.visibility,
      }));
    }
    return null;
  }

  getHands() {
    return this.hands;
  }

  getHandLandmarks() {
    return this.handLandmarks;
  }

  getHandOpen() {
    return this.handOpen;
  }

  getPrevHandOpen() {
    return this.prevHandOpen;
  }

  getConnections() {
    return this.skeletonConnections;
  }
}
