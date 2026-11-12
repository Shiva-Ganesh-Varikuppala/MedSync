import { useEffect, useRef } from "react";
import * as THREE from "three";

/*
 * Photorealistic 3-D capsule rendered on a WebGL canvas via Three.js.
 * – Split purple / orange with physically-based materials (MeshStandardMaterial)
 * – Two-point studio lighting + environment ambient
 * – Soft contact shadow ellipse drawn in CSS
 * – Smooth float + gentle rotation animation
 * – Transparent background so it sits naturally on any page colour
 */
export default function Capsule3D({ width = 340, height = 140 }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const W = width;
    const H = height;

    /* ── Renderer ─────────────────────────────────────── */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountRef.current.appendChild(renderer.domElement);

    /* ── Scene & Camera ───────────────────────────────── */
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
    camera.position.set(0, 0.6, 7);
    camera.lookAt(0, 0, 0);

    /* ── Shared material settings ─────────────────────── */
    const matBase = {
      roughness: 0.18,
      metalness: 0.08,
      envMapIntensity: 1.2,
    };

    /* Purple half material */
    const purpleMat = new THREE.MeshStandardMaterial({
      ...matBase,
      color: new THREE.Color("#6a4fd8"),
      emissive: new THREE.Color("#2a1878"),
      emissiveIntensity: 0.12,
    });

    /* Orange half material */
    const orangeMat = new THREE.MeshStandardMaterial({
      ...matBase,
      color: new THREE.Color("#f47c20"),
      emissive: new THREE.Color("#7a2800"),
      emissiveIntensity: 0.1,
    });

    /* Seam ring material (slight dark ring between halves) */
    const seamMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#1a0a4a"),
      roughness: 0.5,
      metalness: 0.2,
    });

    /* ── Geometry helpers ─────────────────────────────── */
    // We build the capsule from 3 pieces:
    //   leftCap  = hemisphere (purple)
    //   rightCap = hemisphere (orange)
    //   leftCyl  = cylinder half (purple)
    //   rightCyl = cylinder half (orange)
    //   seam     = thin torus at the join

    const R = 0.6;   // radius
    const L = 1.5;   // half-length of cylindrical section

    // Hemisphere geometry (top half of a sphere)
    function makeCap(flip) {
      const geo = new THREE.SphereGeometry(R, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
      if (flip) geo.rotateY(Math.PI).rotateZ(Math.PI);
      return geo;
    }

    // Cylinder half (open ends)
    function makeCylHalf() {
      return new THREE.CylinderGeometry(R, R, L, 64, 1, true);
    }

    /* ── Build meshes ─────────────────────────────────── */
    // Purple cap (left)
    const leftCapMesh = new THREE.Mesh(makeCap(false), purpleMat);
    leftCapMesh.position.set(-L / 2, 0, 0);
    leftCapMesh.rotation.z = -Math.PI / 2;
    leftCapMesh.castShadow = true;

    // Purple cylinder half
    const leftCylGeo = makeCylHalf();
    const leftCylMesh = new THREE.Mesh(leftCylGeo, purpleMat);
    leftCylMesh.rotation.z = Math.PI / 2;
    leftCylMesh.position.set(-L / 4, 0, 0);
    leftCylMesh.castShadow = true;

    // Orange cap (right)
    const rightCapMesh = new THREE.Mesh(makeCap(true), orangeMat);
    rightCapMesh.position.set(L / 2, 0, 0);
    rightCapMesh.rotation.z = Math.PI / 2;
    rightCapMesh.castShadow = true;

    // Orange cylinder half
    const rightCylGeo = makeCylHalf();
    const rightCylMesh = new THREE.Mesh(rightCylGeo, orangeMat);
    rightCylMesh.rotation.z = Math.PI / 2;
    rightCylMesh.position.set(L / 4, 0, 0);
    rightCylMesh.castShadow = true;

    // Seam torus
    const seamGeo = new THREE.TorusGeometry(R, 0.025, 16, 100);
    const seamMesh = new THREE.Mesh(seamGeo, seamMat);
    seamMesh.rotation.y = Math.PI / 2;

    /* ── Group & tilt ─────────────────────────────────── */
    const capsule = new THREE.Group();
    capsule.add(leftCapMesh, leftCylMesh, rightCapMesh, rightCylMesh, seamMesh);
    capsule.rotation.z = -0.28;   // ~16° tilt like the original
    capsule.rotation.x = 0.1;
    scene.add(capsule);

    /* ── Lighting ─────────────────────────────────────── */
    // Ambient
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    // Key light (top-left, cool white)
    const keyLight = new THREE.DirectionalLight(0xe8eeff, 3.5);
    keyLight.position.set(-4, 6, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 20;
    scene.add(keyLight);

    // Fill light (right, warm)
    const fillLight = new THREE.DirectionalLight(0xffe8d0, 1.2);
    fillLight.position.set(5, 2, 3);
    scene.add(fillLight);

    // Rim light (back, cool blue-purple)
    const rimLight = new THREE.DirectionalLight(0xb0a0ff, 1.8);
    rimLight.position.set(0, -4, -6);
    scene.add(rimLight);

    // Small point light on orange side for the warm hotspot
    const warmPoint = new THREE.PointLight(0xff9944, 2.5, 8);
    warmPoint.position.set(2.5, 2, 2);
    scene.add(warmPoint);

    /* ── Fake environment map (gradient hemisphere) ───── */
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0xeeeeff);
    const envTex = pmremGenerator.fromScene(
      new THREE.RoomEnvironment(), 0.04
    ).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    /* ── Float animation ──────────────────────────────── */
    let frameId;
    const clock = new THREE.Clock();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // gentle float
      capsule.position.y = Math.sin(t * 0.9) * 0.08;
      // very slow axial spin so both halves are visible
      capsule.rotation.y = Math.sin(t * 0.4) * 0.18;

      renderer.render(scene, camera);
    };
    animate();

    /* ── Cleanup ──────────────────────────────────────── */
    return () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
      purpleMat.dispose();
      orangeMat.dispose();
      seamMat.dispose();
      envTex.dispose();
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, [width, height]);

  return (
    <div
      style={{
        position: "absolute",
        left: "-28px",
        top: "0px",
        width: `${width}px`,
        height: `${height}px`,
        // contact shadow
        filter: "drop-shadow(0 28px 20px rgba(91,63,208,0.38))",
      }}
      ref={mountRef}
    />
  );
}
