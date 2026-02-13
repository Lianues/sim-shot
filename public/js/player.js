export function createPlayerFactory(THREE) {
  function createNameSprite(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(20,20,20,0.75)';
    roundRect(ctx, 0, 8, canvas.width, 48, 12);
    ctx.fill();

    ctx.font = '28px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.6, 0.65, 1);
    sprite.position.set(0, 3.2, 0);
    return sprite;
  }

  function createBubbleSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    roundRect(ctx, 8, 8, canvas.width - 16, canvas.height - 20, 20);
    ctx.fill();

    ctx.fillStyle = '#1a1a1a';
    ctx.font = '32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const safe = String(text).slice(0, 22);
    ctx.fillText(safe, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(3.6, 0.9, 1);
    sprite.position.set(0, 4.25, 0);
    return sprite;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function createPlayerModel(name, color) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffd5b3 });
    const gunMainMat = new THREE.MeshStandardMaterial({ color: 0x2f3440, metalness: 0.3, roughness: 0.5 });
    const gunAccentMat = new THREE.MeshStandardMaterial({ color: 0x5f6879, metalness: 0.4, roughness: 0.35 });

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 18), skinMat);
    head.position.y = 2.35;

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.5), bodyMat);
    torso.position.y = 1.4;

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 0.22), bodyMat);
    leftArm.position.set(-0.65, 1.45, 0);

    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 0.22), bodyMat);
    rightArm.position.set(0.65, 1.45, 0);

    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.0, 0.28), bodyMat);
    leftLeg.position.set(-0.2, 0.5, 0);

    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.0, 0.28), bodyMat);
    rightLeg.position.set(0.2, 0.5, 0);

    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.14, 0.2), gunMainMat);
    const gunBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.34), gunAccentMat);
    gunBarrel.position.set(0, 0, -0.26);
    gunBody.add(gunBarrel);
    gunBody.position.set(0, -0.12, -0.2);
    rightArm.add(gunBody);

    const nameTag = createNameSprite(name);

    group.add(head, torso, leftArm, rightArm, leftLeg, rightLeg, nameTag);

    group.userData.walkParts = {
      leftArm,
      rightArm,
      leftLeg,
      rightLeg
    };
    group.userData.walkT = Math.random() * Math.PI * 2;
    group.userData.chatBubble = null;

    return group;
  }

  function animateWalk(model, moving, deltaSeconds) {
    const parts = model.userData.walkParts;
    if (!parts) return;

    const speed = 8;
    model.userData.walkT += deltaSeconds * speed;
    const t = model.userData.walkT;

    const targetAmp = moving ? 0.6 : 0;
    const currentAmp = model.userData.currentAmp || 0;
    const amp = currentAmp + (targetAmp - currentAmp) * Math.min(1, deltaSeconds * 10);
    model.userData.currentAmp = amp;

    parts.leftLeg.rotation.x = Math.sin(t) * amp;
    parts.rightLeg.rotation.x = -Math.sin(t) * amp;
    parts.leftArm.rotation.x = -Math.sin(t) * amp * 0.7;
    parts.rightArm.rotation.x = Math.sin(t) * amp * 0.7;
  }

  function showChatBubble(model, text, durationMs = 3000) {
    if (model.userData.chatBubble) {
      model.remove(model.userData.chatBubble.sprite);
      model.userData.chatBubble.sprite.material.map.dispose();
      model.userData.chatBubble.sprite.material.dispose();
      clearTimeout(model.userData.chatBubble.timer);
    }

    const sprite = createBubbleSprite(text);
    model.add(sprite);

    const timer = setTimeout(() => {
      model.remove(sprite);
      sprite.material.map.dispose();
      sprite.material.dispose();
      if (model.userData.chatBubble && model.userData.chatBubble.sprite === sprite) {
        model.userData.chatBubble = null;
      }
    }, durationMs);

    model.userData.chatBubble = { sprite, timer };
  }

  return {
    createPlayerModel,
    animateWalk,
    showChatBubble
  };
}
