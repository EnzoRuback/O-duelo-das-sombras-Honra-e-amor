// Constantes do Jogo
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;
const GROUND_Y = 350;

const STATES = {
    IDLE: 'IDLE',
    MOVE: 'MOVE',
    LIGHT_ATTACK: 'LIGHT_ATTACK',
    HEAVY_ATTACK: 'HEAVY_ATTACK',
    BLOCK: 'BLOCK',
    STUN: 'STUN',
    HURT: 'HURT',
    DEAD: 'DEAD',
    JUMP: 'JUMP',
    DODGE: 'DODGE',
    COMBO_1: 'COMBO_1',
    COMBO_2: 'COMBO_2',
    SIT: 'SIT',
    PREPARE_ATTACK: 'PREPARE_ATTACK',
    PROJECTILE: 'PROJECTILE'
};

// ==========================================
// Classe de Projéteis (Shurikens / Kunais)
// ==========================================
class Projectile {
    constructor(x, y, vx, damage, typeIndex) {
        this.x = x;
        this.y = y;
        this.vx = vx; // Velocidade horizontal
        this.damage = damage;
        this.width = 15;
        this.height = 15;
        this.active = true;
        this.typeIndex = typeIndex; // Para mudar a cor (1=Ciano, 2=Laranja)
        this.angle = 0; // Para rotação visual
    }

    update(dt) {
        if (!this.active) return;
        this.x += this.vx * dt;
        this.angle += 25 * dt; // Rotação rápida
        
        // Destrói se sair da tela (+ margem)
        if (this.x < -100 || this.x > CANVAS_WIDTH + 100) {
            this.active = false;
        }

        // Colisão com o Player (Projéteis IGNORAM BLOCK, só perdoam DODGE e pulos altos)
        if (window.gameInstance && window.gameInstance.player) {
            const p = window.gameInstance.player;
            if (p.state !== STATES.DEAD && p.state !== STATES.DODGE) {
                // Checagem de colisão AABB
                if (this.x < p.x + p.width && this.x + this.width > p.x &&
                    this.y < p.y + p.height && this.y + this.height > p.y) {
                    
                    // Causando dano direto sem chance de parry ou block
                    p.hp -= this.damage;
                    window.gameInstance.createHitSpark(p.x + p.width/2, this.y + this.height/2);
                    window.gameInstance.engine.shake(4, 0.1);
                    
                    if (p.hp <= 0) {
                        p.hp = 0;
                        p.changeState(STATES.DEAD);
                    } else if (p.state !== STATES.HEAVY_ATTACK && p.state !== STATES.STUN) {
                        p.changeState(STATES.HURT, 0.3); 
                    }
                    this.active = false; // Destrói projétil ao acertar
                }
            }
        }
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.save();
        ctx.translate(this.x + this.width/2, this.y + this.height/2);
        ctx.rotate(this.angle);
        
        // Cor baseada em quem atirou
        ctx.fillStyle = this.typeIndex === 1 ? '#00ffff' : '#ff5500';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        
        // Desenha uma Estrela Ninja (Shuriken) 4 pontas
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            ctx.lineTo(8, 0);
            ctx.lineTo(2, 2);
            ctx.rotate(Math.PI / 2);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

const WEAPONS = {
    sword: { label: "Espada", range: 60, damageL: 10, speedL: 0.4, damageH: 25, speedH: 0.8 },
    spear: { label: "Lança", range: 110, damageL: 12, speedL: 0.7, damageH: 30, speedH: 1.2 }
};

const PHASES = [
    { name: "Sua Casa", bg: "#111", enemy: "Nenhum" }, // Phase 0 (Antiga -1, Intro)
    { name: "O Portão", bg: "#4a4a4a", enemy: "Sentinela" }, // Phase 1
    { name: "A Ponte", bg: "#d35400", enemy: "Duelista Ágil" }, // Phase 2
    { name: "O Trono", bg: "#8e0000", enemy: "O Shogun" }, // Phase 3
    { name: "Fim das Sombras", bg: "#eb984e", enemy: "Nenhum" } // Phase 4 Final
];

// Classe Base para Entidades
class Entity {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 80;
        this.color = color;
        
        this.hp = 100;
        this.maxHp = 100;
        this.posture = 100; // Começa com 100 de defesa
        this.maxPosture = 100;
        this.state = STATES.IDLE;
        
        this.vx = 0;
        this.vy = 0; // Pulo/Gravidade
        this.speed = 200;
        this.direction = 1; // 1 = direita, -1 = esquerda
        
        // Controle de animações/estados
        this.stateTimer = 0;
        this.attackHitbox = null;
        this.hasHit = false; // Garante que o ataque causa dano apenas 1 vez por animação
        
        // Mecânica de Postura
        this.timeSinceLastHit = 0;
        this.isBlocking = false;
        this.blockStartTime = 0;

        // Visual (Trails e Poeira)
        this.lastWeaponTip = null;
        this.weaponTrail = [];
        this.dustTimer = 0;
        
        // Combos e Esquiva
        this.comboHistory = [];
        this.lastActionTime = 0;
    }

    changeState(newState, duration = 0) {
        if (this.state === STATES.DEAD) return; // Nao muda se estiver morto
        
        this.state = newState;
        this.stateTimer = duration;
        this.hasHit = false;
        this.attackHitbox = null;
        
        if (newState === STATES.BLOCK) {
            this.isBlocking = true;
            this.blockStartTime = performance.now();
        } else {
            this.isBlocking = false;
        }
    }

    takeDamage(amount, sourceEntity) {
        if (this.state === STATES.DEAD || this.state === STATES.DODGE) return;

        this.timeSinceLastHit = 0;

        // Se estiver bloqueando
        if (this.state === STATES.BLOCK) {
            const blockDuration = performance.now() - this.blockStartTime;
            
            // Perfect Parry (Janela de 150ms)
            if (blockDuration <= 150) {
                // Perfect Parry: 0 dano HP, 0 dano postura para nós, retira postura massiva no inimigo
                sourceEntity.takePostureDamage(amount * 1.2);
                
                // Feedback visual de parry
                if (window.gameInstance) {
                    window.gameInstance.createParrySpark(this.x + this.width/2, this.y + this.height/2);
                    window.gameInstance.engine.shake(8, 0.2);
                    if (window.audioManager) window.audioManager.playSfx('parry');
                }
                return;
            } else {
                // Normal Block: 0 HP dano, remove da nossa postura mas pesa muito (80%)
                this.takePostureDamage(amount * 0.8);
                if (window.audioManager) window.audioManager.playSfx('block');
                return;
            }
        }

        // Se não estava bloqueando, toma o dano integral
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            if (window.audioManager) window.audioManager.playSfx('die');
            this.changeState(STATES.DEAD);
        } else {
            // Reação normal de dano (se não estiver em state ininterrupto como ataque pesado)
            if (this.state !== STATES.HEAVY_ATTACK && this.state !== STATES.STUN) {
                // SISTEMA ANTI-CHEESE (POISE / HYPER ARMOR) para Chefes
                if (this.constructor.name === 'Enemy') {
                     // Ataques leves do Player (Dano < 20) não cancelam a animação do chefe!
                     if (amount < 20) {
                         this.consecutiveHitsTaken = (this.consecutiveHitsTaken || 0) + 1;
                         // Pisca de branco mas não muda de state
                         const oldColor = this.color;
                         this.color = 'white';
                         setTimeout(() => { if(this.state !== STATES.DEAD) this.color = oldColor; }, 100);
                         return; // Sai sem dar stagger
                     } else {
                         // Ataque Pesado quebrou a postura/equilibrio
                         this.consecutiveHitsTaken = 0; 
                     }
                }
                if (window.audioManager) window.audioManager.playSfx('hit');
                this.changeState(STATES.HURT, 0.3); // 300ms hurt
            }
        }
    }

    takePostureDamage(amount) {
        this.posture -= amount;
        if (this.posture <= 0) {
            this.posture = 0; // Postura quebrou
            this.changeState(STATES.STUN, 2.0); // 2 segundos de stun
            if (window.gameInstance) {
                window.gameInstance.engine.shake(5, 0.3);
            }
        }
    }

    forceState(newState) {
        // Função para cutscenes forçarem o player a fazer coisas
        this.state = newState;
        this.stateTimer = 0;
        this.vx = 0;
        this.vy = 0;
    }

    update(dt) {
        // Regeneração de postura (após 6 segundos sem receber golpes - Punição por tartarugar)
        this.timeSinceLastHit += dt;
        if (this.timeSinceLastHit >= 6.0 && this.state !== STATES.STUN) {
            this.posture += 10 * dt; // Regeneração mais lenta
            if (this.posture > this.maxPosture) this.posture = this.maxPosture;
        }

        // Gravidade e Pulo
        this.vy += 1500 * dt; // gravity
        this.y += this.vy * dt;

        if (this.y + this.height >= GROUND_Y) {
            this.y = GROUND_Y - this.height;
            this.vy = 0;
            if (this.state === STATES.JUMP) {
                this.changeState(STATES.IDLE);
            }
        }
        
        // Movimento de Esquiva e Combos Avançados
        if (this.state === STATES.DODGE) {
             this.x += this.direction * 500 * dt;
             this.dustTimer += dt;
             if (this.dustTimer > 0.06 && window.gameInstance) {
                 this.dustTimer = 0;
                 window.gameInstance.createDustSpark(this.x + this.width/2 - (this.direction*10), this.y + this.height);
             }
        } else if (this.state === STATES.COMBO_2) {
             // Estocada avança rápido nos primeiros frames
             if (this.stateTimer > 0.2) this.x += this.direction * 300 * dt;
             this.dustTimer += dt;
             if (this.dustTimer > 0.1 && window.gameInstance) {
                 this.dustTimer = 0;
                 window.gameInstance.createDustSpark(this.x + this.width/2, this.y + this.height);
             }
        }

        // Limites da tela (desativado em cutscenes para saídas/entradas de cena)
        if (!window.gameInstance || !window.gameInstance.isCinematic) {
            this.x = MathUtils.clamp(this.x, 0, CANVAS_WIDTH - this.width);
        }

        // Update timers
        if (this.stateTimer > 0) {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                this.stateTimer = 0;
                
                // Lógica especial ao finalizar um timer
                if (this.state === STATES.PREPARE_ATTACK) {
                     // Terminou de carregar, desfere o golpe!
                     if (this.nextAttackType === 'light') {
                          this.changeState(STATES.LIGHT_ATTACK, 0.3); // Golpe rápido
                          this.createHitbox(60, 10);
                     } else {
                          this.changeState(STATES.HEAVY_ATTACK, 0.6); // Golpe demorado e pesado
                          this.createHitbox(80, 25);
                     }
                     return; // não vai pro IDLE ainda
                }
                else if (this.state === STATES.STUN) {
                    this.posture = this.maxPosture; // reseta a postura (recarrega) após o stun
                }
                
                if (this.state !== STATES.DEAD) {
                    this.changeState(STATES.IDLE);
                }
            }
        }

        // Partículas de Poeira (Move & Jump)
        if (this.state === STATES.MOVE && this.y === GROUND_Y - this.height) {
            this.dustTimer += dt;
            if (this.dustTimer > 0.1) {
                this.dustTimer = 0;
                if (window.gameInstance) {
                    // Poeira saindo dos pés
                    window.gameInstance.createDustSpark(this.x + this.width/2 - (this.direction*10), this.y + this.height);
                }
            }
        } else if (this.state === STATES.JUMP && this.vy < 0) {
             // Rajada de poeira ao pular (1 frame)
             if (!this.jumpDusted) {
                 this.jumpDusted = true;
                 if (window.gameInstance) {
                     for(let d=0; d<4; d++) window.gameInstance.createDustSpark(this.x + this.width/2 + (Math.random()*20-10), this.y + this.height);
                 }
             }
        }
        if (this.state !== STATES.JUMP) this.jumpDusted = false;

        // Reduzir tempo de vida do Weapon Trail
        for (let i = this.weaponTrail.length - 1; i >= 0; i--) {
            this.weaponTrail[i].life -= dt * 6;
            if (this.weaponTrail[i].life <= 0) {
                this.weaponTrail.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x + this.width/2, this.y + this.height);
        ctx.scale(this.direction, 1); // Flip based on direction

        // Cores e efeitos
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.color;
        
        if (this.state === STATES.HURT) {
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'white';
        } else if (this.state === STATES.STUN) {
            ctx.fillStyle = 'gray';
            ctx.strokeStyle = 'gray';
            // Stun effect above head
            ctx.save();
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-10, -90);
            ctx.lineTo(-20, -110);
            ctx.moveTo(10, -90);
            ctx.lineTo(20, -110);
            ctx.stroke();
            ctx.restore();
        } else if (this.state === STATES.PREPARE_ATTACK || this.state === STATES.PROJECTILE) {
            // Brilho de Perigo (Flash vermelho telegrafando golpe)
            const flash = Math.abs(Math.sin(performance.now() * 0.01));
            ctx.shadowColor = 'red';
            ctx.shadowBlur = 15 * flash;
            ctx.strokeStyle = `rgba(255, 50, 50, ${0.5 + 0.5 * flash})`;
        }

        // --- SPRITE PROCEDURAL ANIMADO (SAMURAI) ---
        const time = performance.now() / 1000;
        
        // Medidas Base
        const headRadius = 14;
        const headY = -68; // relativa aos pés
        const torsoEnd = -30;
        
        let leftLegAngle = 0;
        let rightLegAngle = 0;
        let armAngle = 0;
        let armRearAngle = 0; // braço de tras guiando a arma

        // Animação por Estado
        if (this.state === STATES.IDLE) {
            const breath = Math.sin(time * 3) * 2;
            ctx.translate(0, breath); // sobe e desce sutil
            armAngle = Math.PI / 8; // braços caidos
            armRearAngle = -Math.PI / 12;
            leftLegAngle = -10 * Math.PI / 180;
            rightLegAngle = 10 * Math.PI / 180;
        } 
        else if (this.state === STATES.MOVE) {
            const stride = Math.sin(time * 15) * 35;
            leftLegAngle = stride * Math.PI / 180;
            rightLegAngle = -stride * Math.PI / 180;
            armAngle = -stride * 0.5 * Math.PI / 180; 
            armRearAngle = stride * 0.5 * Math.PI / 180;
            ctx.translate(0, Math.abs(Math.sin(time * 15)) * -6); // Bobbing
        } 
        else if (this.state === STATES.JUMP) {
            // Animação fluida de pulo baseada na velocidade (vy)
            // vy vai de ~ -600 (subida forte) ao 0 (topo) até valores positivos (queda)
            const jumpProgress = Math.max(-1, Math.min(1, this.vy / 600)); 
            
            if (jumpProgress < 0) { 
                // Subindo (Esticando o corpo e os braços para alcançar o ar)
                leftLegAngle = -10 * Math.PI / 180;
                rightLegAngle = 20 * Math.PI / 180;
                armAngle = (-100 + (jumpProgress * 40)) * Math.PI / 180; // Braços se lançando para cima
                armRearAngle = 60 * Math.PI / 180;
                ctx.translate(0, 10 * jumpProgress); // Estica torso levemente pra cima (negativo Y)
            } else { 
                // Caindo (Flexionando as pernas para absorver impacto e abaixando os braços pelo vento)
                leftLegAngle = (-10 - (jumpProgress * 40)) * Math.PI / 180; 
                rightLegAngle = (20 + (jumpProgress * 50)) * Math.PI / 180;
                armAngle = (-60 + (jumpProgress * 50)) * Math.PI / 180; 
                armRearAngle = (60 - (jumpProgress * 40)) * Math.PI / 180;
                ctx.translate(0, 15 * Math.pow(jumpProgress, 2)); // Corpo afunda para preparar aterrissagem
            }
        }  
        else if (this.state === STATES.PREPARE_ATTACK || this.state === STATES.PROJECTILE) {
             // Inimigo carrega golpe puxando o corpo e a arma bem pra tras
             ctx.translate(-15, 5); // puxa pra tras
             leftLegAngle = -20 * Math.PI / 180;
             rightLegAngle = 30 * Math.PI / 180;
             armAngle = 140 * Math.PI / 180;
             armRearAngle = 120 * Math.PI / 180;
        }
        else if (this.state === STATES.BLOCK) {
            let weapon = this.weaponType;
            if (this.constructor.name === 'Enemy') {
                 // Boss Phase 1 = Lança. Fase 2/3 = Katana (espada)
                 weapon = this.typeIndex === 0 ? 'spear' : 'sword'; 
            }
            
            if (weapon === 'spear') {
                 // Defesa Lança: Crava a lança no chão na vertical e se esconde atrás
                 armAngle = -20 * Math.PI / 180;
                 armRearAngle = 0 * Math.PI / 180;
                 ctx.translate(0, 5);
                 leftLegAngle = -10 * Math.PI / 180;
                 rightLegAngle = 20 * Math.PI / 180;
            } else {
                 // Defesa Espada: Levanta a espada na horizontal na altura do rosto
                 armAngle = -110 * Math.PI / 180; 
                 armRearAngle = -90 * Math.PI / 180;
                 ctx.translate(-5, 8); // agachado firmemente
                 leftLegAngle = -15 * Math.PI / 180;
                 rightLegAngle = 15 * Math.PI / 180;
            }
            
            // Desenhar Brilho na Arma (Substituindo o Escudo Azul antigo)
            ctx.save();
            ctx.scale(this.direction, 1);
            ctx.strokeStyle = '#ffffff';
            ctx.shadowColor = '#ffffaa';
            ctx.shadowBlur = 10;
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            // Fagulhas e Vento ao redor da arma defendendo
            const sparkY = weapon === 'spear' ? -this.height + 20 : -this.height/2;
            const sparkX = weapon === 'spear' ? 20 : 15;
            
            ctx.moveTo(sparkX - 15, sparkY - 15);
            ctx.lineTo(sparkX + 15, sparkY + 15);
            ctx.moveTo(sparkX - 15, sparkY + 15);
            ctx.lineTo(sparkX + 15, sparkY - 15);
            
            // Circulo guia de defesa sutil
            ctx.arc(sparkX, sparkY, 20, 0, Math.PI * 2);
            
            ctx.stroke();
            ctx.restore();
        }
        else if (this.state === STATES.SIT) {
             // Ajoelhado no tatame (Seiza)
             ctx.translate(0, 25); // Afunda muito
             leftLegAngle = -70 * Math.PI / 180;
             rightLegAngle = 90 * Math.PI / 180;
             armAngle = -20 * Math.PI / 180; // Braços relaxados na perna
             armRearAngle = -10 * Math.PI / 180;
        }
        else if (this.state === STATES.DODGE) {
            ctx.globalAlpha = 0.4; // Efeito invencivel fantasma
            ctx.translate(15, 10); // Super inclinado p/ frente
            leftLegAngle = -60 * Math.PI / 180;
            rightLegAngle = 50 * Math.PI / 180;
            armAngle = 80 * Math.PI / 180; // Braços pra trás (Naruto run)
            armRearAngle = 90 * Math.PI / 180;
        }
        else if (this.state === STATES.COMBO_1) { // L, L, K (Pulo Smash)
             let progress = 1 - (this.stateTimer / 0.8);
             if (progress < 0.4) {
                 armAngle = 160 * Math.PI / 180; // Arma muito alto nas costas
                 armRearAngle = 140 * Math.PI / 180;
                 ctx.translate(0, -20); // Suspenso no ar
                 leftLegAngle = 30 * Math.PI / 180;
                 rightLegAngle = 40 * Math.PI / 180;
             } else {
                 armAngle = -120 * Math.PI / 180; // Esmaga chao
                 armRearAngle = -100 * Math.PI / 180;
                 ctx.translate(20, 15); // Afunda no chao
                 leftLegAngle = -50 * Math.PI / 180;
                 rightLegAngle = 40 * Math.PI / 180;
             }
        }
        else if (this.state === STATES.COMBO_2) { // Dodge, K (Estocada Longe)
             let progress = 1 - (this.stateTimer / 0.5);
             if (progress < 0.4) {
                 armAngle = 90 * Math.PI / 180; // Puxa pra tras
                 armRearAngle = 70 * Math.PI / 180;
                 ctx.translate(-10, 5);
             } else {
                 armAngle = -45 * Math.PI / 180; // Estoca reto pra frente
                 armRearAngle = -45 * Math.PI / 180;
                 ctx.translate(30, 8); // Avança mt o corpo
                 leftLegAngle = -70 * Math.PI / 180;
                 rightLegAngle = 20 * Math.PI / 180;
             }
        }
        else if (this.state === STATES.LIGHT_ATTACK || this.state === STATES.HEAVY_ATTACK) {
             let progress = 1.0;
             if (this.constructor.name === 'Player') {
                 const totalTime = this.state === STATES.LIGHT_ATTACK ? this.weaponMetrics.speedL : this.weaponMetrics.speedH;
                 progress = 1 - (this.stateTimer / totalTime);
             } else {
                 const totalTime = this.state === STATES.LIGHT_ATTACK ? 0.4 : 0.9;
                 progress = 1 - (this.stateTimer / totalTime);
             }

             // Animação de Corte Curvado
             if (progress < 0.3) {
                 armAngle = 120 * Math.PI / 180; // Levanta espada/lança bem alto pra trás
                 armRearAngle = 100 * Math.PI / 180;
                 ctx.translate(-5, 0); // puxa corpo
                 leftLegAngle = 0;
                 rightLegAngle = 20 * Math.PI / 180;
             } else if (progress < 0.5) {
                 // Golpe descendo
                 armAngle = 0 * Math.PI / 180; 
                 armRearAngle = 20 * Math.PI / 180;
                 ctx.translate(15, 5); // afunda frente
                 leftLegAngle = -40 * Math.PI / 180;
                 rightLegAngle = 30 * Math.PI / 180;
             } else {
                 // Follow through
                 armAngle = -110 * Math.PI / 180; // Esticado no chão/frente
                 armRearAngle = -90 * Math.PI / 180;
                 ctx.translate(15, 8);
                 leftLegAngle = -40 * Math.PI / 180;
                 rightLegAngle = 30 * Math.PI / 180;
             }
        }

        ctx.lineCap = 'square';
        ctx.lineJoin = 'round';

        // Cores Samurai
        const armorColor = this.constructor.name === 'Enemy' ? '#3e1a1a' : '#2c3e50';
        const clothColor = this.constructor.name === 'Enemy' ? '#140c0c' : '#1a1a1a';
        const skinColor = '#000'; // Silhueta

        // 1. BRAÇO TRASEIRO E PERNA TRASEIRA
        ctx.lineWidth = 7;
        ctx.strokeStyle = skinColor;
        ctx.beginPath();
        ctx.moveTo(0, torsoEnd);
        ctx.lineTo(Math.sin(rightLegAngle) * 30, torsoEnd + Math.cos(rightLegAngle) * 30);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, headY + 10);
        ctx.lineTo(Math.sin(armRearAngle) * 22, headY + 10 + Math.cos(armRearAngle) * 22);
        ctx.stroke();

        // 2. CORPO / HAKAMA (SAIA SAMURAI) E ARMADURA
        // Hakama (Saia Larga)
        ctx.fillStyle = clothColor;
        ctx.beginPath();
        if (this.state === STATES.SIT) {
             // O hakama espalha no chao quando sentado
             ctx.moveTo(-15, torsoEnd - 15);
             ctx.lineTo(20, torsoEnd - 15);
             ctx.lineTo(30, torsoEnd + 15);
             ctx.lineTo(-25, torsoEnd + 15);
        } else {
             ctx.moveTo(-10, torsoEnd - 15);
             ctx.lineTo(15, torsoEnd - 15);
             ctx.lineTo(18, torsoEnd + 15);
             ctx.lineTo(-12, torsoEnd + 10);
        }
        ctx.fill();

        // Torso Peitoral Armor (Do)
        ctx.fillStyle = armorColor;
        ctx.beginPath();
        ctx.moveTo(-12, headY + 5);
        ctx.lineTo(12, headY + 8);
        ctx.lineTo(10, torsoEnd - 10);
        ctx.lineTo(-10, torsoEnd - 12);
        ctx.fill();

        // 3. CABEÇA / KABUTO (ELMO)
        ctx.fillStyle = skinColor;
        ctx.beginPath();
        ctx.arc(0, headY, headRadius, 0, Math.PI * 2);
        ctx.fill();

        // Kabuto Helmet Top & Horns
        ctx.fillStyle = armorColor;
        ctx.beginPath();
        ctx.arc(-2, headY-2, headRadius + 2, Math.PI, Math.PI*2);
        ctx.fill();
        // Chifres do Elmo
        ctx.strokeStyle = '#f1c40f'; // Dourado
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(4, headY-12);
        ctx.lineTo(18, headY-22);
        ctx.moveTo(4, headY-12);
        ctx.lineTo(-10, headY-20);
        ctx.stroke();
        // Proteção Nuca
        ctx.beginPath();
        ctx.moveTo(-12, headY);
        ctx.lineTo(-20, headY + 15);
        ctx.lineTo(-10, headY + 12);
        ctx.stroke();

        // 4. PERNA FRENTE / BRAÇO FRENTE (Sode - Ombreira)
        ctx.lineWidth = 8;
        ctx.strokeStyle = skinColor;
        ctx.beginPath();
        ctx.moveTo(0, torsoEnd);
        ctx.lineTo(Math.sin(leftLegAngle) * 30, torsoEnd + Math.cos(leftLegAngle) * 30);
        ctx.stroke();

        // Braço
        const shoulderX = 2;
        const shoulderY = headY + 8;
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        const handX = shoulderX + Math.sin(armAngle) * 28;
        const handY = shoulderY + Math.cos(armAngle) * 28;
        ctx.lineTo(handX, handY);
        ctx.stroke();

        // Ombreira (Sode)
        ctx.fillStyle = armorColor;
        ctx.beginPath();
        ctx.fillRect(shoulderX - 8, shoulderY - 5, 16, 14);

        // 5. ARMAS POLIDAS E RASTRO (TRAIL)
        if ((this.constructor.name === 'Player' || this.constructor.name === 'Enemy') && this.state !== STATES.BLOCK) {
            ctx.save();
            // Espada/Lança customizada
            let weaponColor = this.constructor.name === 'Enemy' ? '#e74c3c' : '#bdc3c7';
            ctx.fillStyle = weaponColor;
            ctx.strokeStyle = weaponColor;
            
            let wType = 'sword';
            if (this.constructor.name === 'Player') wType = this.weaponType;
            if (this.constructor.name === 'Enemy' && this.typeIndex === 0) wType = 'spear';
            if (this.constructor.name === 'Enemy' && this.typeIndex >= 1) wType = 'sword';
            
            // Calculo do pivo da arma (angulo baseado na mao mas estendendo)
            const wAngle = armAngle - Math.PI/2 - 0.2; // Rotação da arma na mão
            ctx.translate(handX, handY);
            ctx.rotate(wAngle); // Gira o grid na direcao da arma apontada pra cima/frente da mao
            
            let tipX = 0, tipY = 0; // Armazena coordenada global da ponta da lâmina p/ trail

            if (wType === 'sword') {
                // Katana Curvada
                ctx.lineWidth = 4;
                // Guarda (Tsuba)
                ctx.fillStyle = '#f1c40f';
                ctx.fillRect(-5, -3, 10, 6);
                
                // Lâmina curva procedural (Path)
                ctx.beginPath();
                ctx.moveTo(0, -3); // base lâmina
                ctx.quadraticCurveTo(15, -25, 5, -55); // curva principal
                ctx.quadraticCurveTo(0, -30, -3, -3); // lado liso
                ctx.fill();
                
                // Cabo (Tsuka)
                ctx.fillStyle = '#444';
                ctx.fillRect(-3, 3, 6, 16);

                tipX = 5; tipY = -55;
            } else {
                // Lança (Yari)
                ctx.lineWidth = 3;
                
                // Haste escura
                ctx.strokeStyle = '#5c4033';
                ctx.beginPath();
                ctx.moveTo(0, 40);
                ctx.lineTo(0, -40);
                ctx.stroke();
                
                // Lâmina Larga de Lança
                ctx.beginPath();
                ctx.moveTo(0, -40); // base lamina
                ctx.lineTo(-8, -50); // gomos
                ctx.lineTo(0, -80); // ponta fura
                ctx.lineTo(8, -50);
                ctx.closePath();
                ctx.fill();

                tipX = 0; tipY = -80;
            }

            // Descobrir a posiçao global X,Y da "ponta" da arma dadas todas as matrizes transformadas
            const matrix = ctx.getTransform();
            const globalTipX = matrix.a * tipX + matrix.c * tipY + matrix.e;
            const globalTipY = matrix.b * tipX + matrix.d * tipY + matrix.f;
            ctx.restore(); // Volta matriz pra samurai basico local

            // Adiciona ponto no Rastro se estiver atacando
            if ((this.state === STATES.LIGHT_ATTACK || this.state === STATES.HEAVY_ATTACK || this.state === STATES.COMBO_1 || this.state === STATES.COMBO_2)) {
                if (this.lastWeaponTip) {
                    this.weaponTrail.push({
                         x1: this.lastWeaponTip.x, y1: this.lastWeaponTip.y,
                         x2: globalTipX, y2: globalTipY,
                         life: 1.0
                    });
                }
                this.lastWeaponTip = { x: globalTipX, y: globalTipY };
            } else {
                this.lastWeaponTip = null;
            }
        } else {
            this.lastWeaponTip = null;
        }

        ctx.restore(); // Fim do local do personagem, volta pro GLOBAL pra desenhar Trails

        // RENDERIZAR WEAPON TRAILS NO MUNDO (Global coordinates)
        if (this.weaponTrail.length > 0) {
            ctx.save();
            ctx.lineCap = 'square';
            const shadowColor = this.constructor.name === 'Enemy' ? '231, 76, 60' : '189, 195, 199'; // RGB p/ alfa
            for (let i = 0; i < this.weaponTrail.length; i++) {
                const t = this.weaponTrail[i];
                ctx.lineWidth = 6 + (t.life * 10);
                ctx.strokeStyle = `rgba(${shadowColor}, ${t.life * 0.4})`; // Traço largo fantasma
                ctx.beginPath();
                ctx.moveTo(t.x1, t.y1);
                ctx.lineTo(t.x2, t.y2);
                ctx.stroke();
                
                // Traco fino brilho
                ctx.lineWidth = 2 + (t.life * 4);
                ctx.strokeStyle = `rgba(255, 255, 255, ${t.life * 0.8})`; 
                ctx.beginPath();
                ctx.moveTo(t.x1, t.y1);
                ctx.lineTo(t.x2, t.y2);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Draw attack hitboxes for debugging and visual flare
        if (this.attackHitbox && this.stateTimer > 0.1) {
            ctx.fillStyle = (this.state === STATES.HEAVY_ATTACK || this.state === STATES.COMBO_1 || this.state === STATES.COMBO_2) ? 'rgba(255, 0, 0, 0.4)' : 'rgba(255, 255, 0, 0.4)';
            ctx.fillRect(this.attackHitbox.x, this.attackHitbox.y, this.attackHitbox.width, this.attackHitbox.height);
        }
    }
}

class Geisha extends Entity {
    constructor(x, y) {
        super(x, y, '#bdc3c7');
        this.direction = -1; // Olha para o Player
        this.forceState(STATES.SIT);
    }
    
    update(dt) {
        super.update(dt);
        if (this.state === STATES.MOVE) {
            this.x += this.direction * 50 * dt; // andada super lenta
        }
    }
    
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
        
        // Tremida Hurt
        if (this.state === STATES.HURT) {
            ctx.translate((Math.random() - 0.5) * 4, 0);
        }
        
        // Seiza (Sentado)
        let offsetY = 0;
        if (this.state === STATES.SIT) {
             offsetY = 30; // Bem baixo
        }
        
        ctx.scale(this.direction, 1);
        
        // Kimono (Vermelho bordô e Dourado)
        ctx.fillStyle = '#8e0000';
        ctx.beginPath();
        if (this.state === STATES.SIT) {
            // Kimono espalhado
            ctx.moveTo(-20, -10 + offsetY);
            ctx.lineTo(20, -10 + offsetY);
            ctx.lineTo(30, 40 + offsetY);
            ctx.lineTo(-30, 40 + offsetY);
        } else {
            // Kimono de pé longo
            ctx.moveTo(-15, -10);
            ctx.lineTo(15, -10);
            ctx.lineTo(10, 40);
            ctx.lineTo(-10, 40);
        }
        ctx.fill();
        
        // Obi (Faixa na cintura)
        ctx.fillStyle = '#f1c40f'; // Gold
        ctx.fillRect(-16, -5 + offsetY, 32, 10);
        // Obi laço costas
        ctx.fillRect(-22, -8 + offsetY, 8, 16);
        
        // Cabelo (Coque tradicional com Kanzashi - palitos amarelos)
        ctx.fillStyle = '#111'; // Cabelo negro
        ctx.beginPath();
        ctx.arc(0, -30 + offsetY, 14, 0, Math.PI*2); // cabeça
        ctx.arc(-8, -38 + offsetY, 8, 0, Math.PI*2); // coque 1
        ctx.arc(8, -35 + offsetY, 7, 0, Math.PI*2); // coque 2
        ctx.fill();
        
        // Kanzashi (Palitos de cabelo)
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-5, -35 + offsetY);
        ctx.lineTo(-25, -45 + offsetY);
        ctx.moveTo(5, -35 + offsetY);
        ctx.lineTo(20, -25 + offsetY);
        ctx.stroke();

        // Rosto pálido (Oshiroi)
        ctx.fillStyle = '#ecf0f1';
        ctx.beginPath();
        ctx.arc(5, -30 + offsetY, 11, 0, Math.PI*2);
        ctx.fill();
        // Lábio vermelho
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(10, -27 + offsetY, 4, 3);
        
        // Braço escondido na manga longa do Kimono
        ctx.fillStyle = '#6c0000';
        ctx.beginPath();
        if (this.state === STATES.SIT) {
            ctx.moveTo(0, -10 + offsetY);
            ctx.lineTo(22, 10 + offsetY);
            ctx.lineTo(15, 30 + offsetY);
            ctx.lineTo(-5, 0 + offsetY);
        } else if (this.state === STATES.HURT) {
            // Braço levantado assustada
            ctx.moveTo(0, -10);
            ctx.lineTo(15, -30);
            ctx.lineTo(25, -25);
            ctx.lineTo(10, 0);
        } else {
            ctx.moveTo(0, -10);
            ctx.lineTo(5, 10);
            ctx.lineTo(-5, 30);
            ctx.lineTo(-10, 0);
        }
        ctx.fill();

        ctx.restore();
    }
}

class Player extends Entity {
    constructor(x, y, playerName, weaponType) {
        super(x, y, '#000000'); // Silhouette preta minimalista
        this.input = null; // Setado pela engine depois
        this.playerName = playerName || "Jogador";
        this.weaponType = weaponType || 'sword';
        this.weaponMetrics = WEAPONS[this.weaponType];
    }

    update(dt) {
        super.update(dt);
        
        // Impede movimentação em Cutscenes ou bloqueio completo
        if (window.gameInstance && window.gameInstance.isCinematic) {
             // Deixa a engine de cinematics controlar (fisica pura)
             return; 
        }

        if (this.state === STATES.DEAD) return;

        // Se input não foi passado ainda ou está travado em animações
        if (!this.input || [STATES.LIGHT_ATTACK, STATES.HEAVY_ATTACK, STATES.COMBO_1, STATES.COMBO_2, STATES.HURT, STATES.STUN].includes(this.state)) {
            // Lógica de dano durante ataque
            this.handleAttackHit();
            return;
        }
        
        // Final da esquiva permite estocar antes de voltar pro IDLE
        if (this.state === STATES.DODGE) {
             if (this.input.justPressed['k'] || this.input.keys['k']) {
                 this.performAttack('heavy'); // performs combo 2 automatically cause DODGE is in history
             }
             return; // Bloqueia outros inputs (movement)
        }

        // Limpa histórico de combos se ocioso por mais de 1000ms
        if (performance.now() - this.lastActionTime > 1000) {
            this.comboHistory = [];
        }

        // Defesa (Hold F) não pode pular/defender ao mesmo tempo no ar
        if (this.input.keys['f'] && this.y === GROUND_Y - this.height) {
            if (this.state !== STATES.BLOCK) this.changeState(STATES.BLOCK);
            return; // não pode atacar/mover/pular bloqueando
        } else if (this.state === STATES.BLOCK) {
            this.changeState(STATES.IDLE);
        }

        // Pulo (W ou Seta Cima)
        if ((this.input.keys['w'] || this.input.keys['arrowup'] || this.input.justPressed['w']) && this.y === GROUND_Y - this.height) {
            this.vy = -600;
            if (window.audioManager) window.audioManager.playSfx('jump');
            this.changeState(STATES.JUMP);
        }

        // Esquiva Fluida (Shift) com i-frames em DODGE e RECOMPENSA DE FÔLEGO (+15 Postura)
        if (this.input.justPressed['shift']) {
            this.lastActionTime = performance.now();
            this.comboHistory.push('DODGE');
            if (window.audioManager) window.audioManager.playSfx('dodge');
            this.changeState(STATES.DODGE, 0.35); // 350ms esquiva super rapida
            // Recompensa de Postura ao realizar esquiva
            if (this.posture < this.maxPosture) {
                 this.posture += 15;
                 if (this.posture > this.maxPosture) this.posture = this.maxPosture;
            }
            window.gameInstance.engine.shake(2, 0.1);
            return;
        }

        // Ataques (J para Leve, K para Pesado)
        if (this.input.justPressed['j']) {
            this.performAttack('light');
            return;
        }
        if (this.input.justPressed['k']) {
            this.performAttack('heavy');
            return;
        }

        // Movimento (Setas ou A/D)
        if (this.state !== STATES.HURT) {
            this.vx = 0;
            if (this.input.keys['arrowleft'] || this.input.keys['a']) {
                this.vx = -this.speed;
                this.direction = -1;
            } else if (this.input.keys['arrowright'] || this.input.keys['d']) {
                this.vx = this.speed;
                this.direction = 1;
            }
        }

        if (this.vx !== 0) {
            if (this.state !== STATES.JUMP) this.changeState(STATES.MOVE);
            this.x += this.vx * dt;
        } else if (this.state === STATES.MOVE) {
            this.changeState(STATES.IDLE);
        }
    }

    performAttack(type) {
        this.lastActionTime = performance.now();
        if (type === 'light') {
            this.comboHistory.push('L');
            if (window.audioManager) window.audioManager.playSfx('swing_light');
            this.changeState(STATES.LIGHT_ATTACK, this.weaponMetrics.speedL); 
            this.createHitbox(this.weaponMetrics.range, this.weaponMetrics.damageL, this.weaponMetrics.speedL);           
        } else {
            // Verifica os Históricos de Combos antes de dar o Ataque Pesado (K) normal
            const lastAction = this.comboHistory[this.comboHistory.length - 1];
            const prevAction = this.comboHistory[this.comboHistory.length - 2];
            
            if (lastAction === 'DODGE') {
                 // COMBO 2: Esquiva + Pesado (Dash Thrust Sagaz)
                 this.comboHistory.push('H');
                 if (window.audioManager) window.audioManager.playSfx('swing_heavy');
                 this.changeState(STATES.COMBO_2, 0.5);
                 this.createHitbox(this.weaponMetrics.range * 1.5, this.weaponMetrics.damageH * 1.2, 0.5);
                 window.gameInstance.engine.shake(4, 0.2);
            } else if (lastAction === 'L' && prevAction === 'L') {
                 // COMBO 1: Dois leves + Pesado (Slam Mortal no Chão)
                 this.comboHistory = []; // Gasta o combo no finisher
                 if (window.audioManager) window.audioManager.playSfx('swing_heavy');
                 this.changeState(STATES.COMBO_1, 0.8);
                 this.createHitbox(this.weaponMetrics.range * 1.2, this.weaponMetrics.damageH * 2.0, 0.8);
                 this.vy = -300; // Suspensão no ar antes de cair
                 window.gameInstance.engine.shake(6, 0.3);
            } else {
                 // Pesado normal
                 this.comboHistory.push('H');
                 if (window.audioManager) window.audioManager.playSfx('swing_heavy');
                 this.changeState(STATES.HEAVY_ATTACK, this.weaponMetrics.speedH); 
                 this.createHitbox(this.weaponMetrics.range, this.weaponMetrics.damageH, this.weaponMetrics.speedH);
            }
        }
    }

    createHitbox(range, damage, duration) {
        const hitboxWidth = range;
        const hitboxX = this.direction === 1 ? this.x + this.width : this.x - hitboxWidth;
        this.attackHitbox = {
            x: hitboxX, y: this.y + 20, width: hitboxWidth, height: 40, damage: damage
        };
    }

    handleAttackHit() {
        // Aplica o dano se houver um inimigo pego e ainda nao aplicou
        if (this.attackHitbox && !this.hasHit && window.gameInstance && window.gameInstance.enemy) {
            const enemy = window.gameInstance.enemy;
            if (enemy.state !== STATES.DEAD && MathUtils.checkCollision(this.attackHitbox, enemy)) {
                enemy.takeDamage(this.attackHitbox.damage, this);
                this.hasHit = true;
                window.gameInstance.createHitSpark(enemy.x + enemy.width/2, enemy.y + 20);
            }
        }
    }
}

class Enemy extends Entity {
    constructor(x, y, typeIndex) {
        super(x, y, '#111111');
        this.direction = -1;
        this.typeIndex = typeIndex;
        this.aiTimer = 0;
        this.consecutiveHitsTaken = 0; // Anti-spam tracking
        
        // Define Atributos baseados na fase (Dificuldade Extrema!)
        if (typeIndex === 0) {
            // Sentinela (Fase 1)
            this.maxHp = 150;
            this.hp = 150;
            this.attackCooldown = 1.0; // Era 1.8
            this.attackType = 'heavy';
            this.speed = 130;          // Era 110
        } else if (typeIndex === 1) {
            // Duelista (Fase 2)
            this.maxHp = 200;
            this.hp = 200;
            this.attackCooldown = 0.3; // Era 0.5 (Frenético)
            this.attackType = 'light';
            this.speed = 220;          // Era 200
        } else {
            // Shogun (Fase 3)
            this.maxHp = 300; // Tank absoluto
            this.hp = 300;
            this.attackCooldown = 0.6; // Era 0.8
            this.attackType = 'mixed';
            this.speed = 180;          // Era 160
        }
    }

    update(dt) {
        super.update(dt);
        if (window.gameInstance && window.gameInstance.isCinematic) return; // Congela IA na cutscene
        if (this.state === STATES.DEAD) return;

        // Anti-Cheese: Se tomou 3+ acertos seguidos de spam leve, ele foge pra trás
        if (this.consecutiveHitsTaken >= 3 && this.state !== STATES.DODGE) {
             this.consecutiveHitsTaken = 0;
             this.changeState(STATES.DODGE, 0.4); // Evasão rápida
             this.direction = player && player.x < this.x ? -1 : 1; 
             // Pula para trás (inverte a direção do dodge base)
             this.x += (this.direction === 1 ? -1 : 1) * 150; 
             window.gameInstance.engine.shake(3, 0.1);
             return;
        }

        // Se travado em animações ininterruptas (ataques ou danos)
        if ([STATES.LIGHT_ATTACK, STATES.HEAVY_ATTACK, STATES.HURT, STATES.STUN, STATES.PROJECTILE].includes(this.state)) {
            this.handleAttackHit();
            return;
        }

        // Se estiver carregando o ataque (Telegraphing) - Agora ele pode andar lentamente enquanto carrega!
        if (this.state === STATES.PREPARE_ATTACK) {
             // Inimigos mais apelões avançam devagarzinho enquanto preparam
             if (this.typeIndex >= 1) { // Só Duelista e Shogun
                 this.x += this.direction * (this.speed * 0.3) * dt; 
             }
             return; 
        }

        // Lógica simples de IA (Baseada em Distância)
        const player = window.gameInstance.player;
        if (!player || player.state === STATES.DEAD) {
            this.changeState(STATES.IDLE);
            return;
        }

        const dist = Math.abs(player.x - this.x);
        this.direction = player.x < this.x ? -1 : 1;

        // Se estiver bloqueando aleatoriamente (apenas Fase 2/3)
        if (this.state === STATES.BLOCK) {
            this.aiTimer -= dt;
            if (this.aiTimer <= 0) this.changeState(STATES.IDLE);
            return;
        }

        if (dist > 250) {
            // Se jogador estiver MUITO Longe (Tentando recuperar vida covardemente)
            this.aiTimer += dt;
            if (this.aiTimer >= this.attackCooldown) {
                this.aiTimer = 0;
                this.changeState(STATES.IDLE);
                
                if (this.typeIndex >= 1) { // Duelista ou Shogun (Projéteis)
                    this.changeState(STATES.PREPARE_ATTACK, 0.3); // O chefe encolhe antes de atirar
                    this.state = STATES.PROJECTILE; // Override state immediately for logic separation
                    this.stateTimer = 0.3;
                    // Lança Shuriken veloz!
                    const projVx = this.direction * 600;
                    window.gameInstance.projectiles.push(new Projectile(this.x + this.width/2, this.y + 20, projVx, 15, this.typeIndex));
                    window.gameInstance.createDustSpark(this.x + this.width/2, this.y + this.height);
                } else { // Sentinela (Fase 1) - Pulo brutal pra encurtar distância
                    this.changeState(STATES.JUMP);
                    this.vy = -400; // Pulo alto
                    this.vx = this.direction * 400; // Avança
                    this.x += this.vx * dt; // Aplica o Pulo
                }
            } else {
                this.changeState(STATES.MOVE);
                this.x += this.direction * this.speed * dt;
            }
        } else if (dist > 80) {
            // Anda na direção do jogador normal (Média distância)
            this.changeState(STATES.MOVE);
            this.x += this.direction * this.speed * dt;
        } else {
            // Tá perto
            this.changeState(STATES.IDLE);
            this.aiTimer += dt;
            
            // Defesa Aleatória para Duelista/Shogun
            if (this.typeIndex >= 1 && Math.random() < 0.01 && player.state.includes("ATTACK")) {
                this.changeState(STATES.BLOCK, 0.5); // Bloqueia por 0.5s
                this.aiTimer = 0.5; // lock AI
                return;
            }

            // Decide atacar ou combar
            if (this.aiTimer >= this.attackCooldown) {
                this.aiTimer = 0;
                
                // Variabilidade Estratégica
                let attackChoice = this.attackType;
                if (attackChoice === 'mixed') {
                    // Shogun Inteligente - Tende a não repetir o último ataque
                    attackChoice = Math.random() > 0.4 ? 'light' : 'heavy';
                }

                // Lógica de "Combo" Absurda (Atacar de novo sem respeitar cooldown)
                let comboChance = 0;
                if (this.typeIndex === 0) comboChance = 0.30; // 30% Sentinela
                if (this.typeIndex === 1) comboChance = 0.60; // 60% Duelista
                if (this.typeIndex === 2) comboChance = 0.50; // 50% Shogun
                
                if (Math.random() < comboChance && player.state !== STATES.DEAD) {
                     // Combo instantâneo!
                     this.aiTimer = this.attackCooldown - 0.15; // Quase sem tempo de respirar
                }

                this.performAttack(attackChoice);
            }
        }
    }

    performAttack(type) {
        // Agora todos os ataques inimigos são telegrafados (Brutais e Rápidos)
        this.nextAttackType = type;
        if (type === 'light') {
             this.changeState(STATES.PREPARE_ATTACK, 0.2); // Telegraph imperceptível
             this.createHitbox(100, 15); // Hitbox longa (100px) Lança/Espada rápida
        } else {
             this.changeState(STATES.PREPARE_ATTACK, 0.4); // Telegraph curto
             this.createHitbox(160, 45); // Hitbox estendida MASSIVA (Quase inesquivavel pulando pra tras)
        }
    }

    createHitbox(range, damage) {
        const hitboxWidth = range;
        const hitboxX = this.direction === 1 ? this.x + this.width : this.x - hitboxWidth;
        this.attackHitbox = {
            x: hitboxX, y: this.y + 20, width: hitboxWidth, height: 40, damage: damage
        };
    }

    handleAttackHit() {
        if (this.attackHitbox && !this.hasHit && window.gameInstance && window.gameInstance.player) {
            const player = window.gameInstance.player;
            if (player.state !== STATES.DEAD && MathUtils.checkCollision(this.attackHitbox, player)) {
                player.takeDamage(this.attackHitbox.damage, this);
                this.hasHit = true;
                window.gameInstance.createHitSpark(player.x + player.width/2, player.y + 20);
            }
        }
    }
}

// Classe Principal do Jogo
class Game {
    constructor() {
        this.engine = new GameEngine('gameCanvas');
        this.engine.start();
        window.gameInstance = this;

        this.currentPhase = 0;
        this.sparks = []; // Partículas para parry/hits
        this.projectiles = []; // Shurikens e Tiros
        this.envParticles = []; // Partículas cenográficas (Folhas, Sakuras)
        this.bgTime = 0;
        
        // Sistema de Cinemáticas e História
        this.isCinematic = false;
        this.activeDialog = null; // { text: "Falas", author: "Nome", charIndex: 0, timer: 0 }
        this.cinematicTimer = 0;
        this.cinematicStep = 0;
        this.blackScreenAlpha = 0; // Transições
        this.bigText = null; // "3.. 2.. 1.. HAJIME!"
        this.bigTextTimer = 0;
        
        // Configurações vindas do Menu
        this.playerName = "Jogador";
        this.weaponType = "sword";
        this.isStarted = false;

        // Menu Inicial Wiring
        const btnStart = document.getElementById('btnStart');
        if (btnStart) {
            btnStart.addEventListener('click', () => {
                if (window.audioManager) {
                    window.audioManager.init();
                    window.audioManager.playSfx('start');
                }
                const nameInput = document.getElementById('playerName').value;
                const weaponSelect = document.getElementById('weaponSelect').value;
                
                this.playerName = nameInput.trim() === "" ? "Jogador" : nameInput;
                this.weaponType = weaponSelect;
                
                document.getElementById('mainMenu').style.display = 'none';
                this.startGame();
            });
        }
        
        // Input Global para Dialogos
        window.addEventListener('keydown', (e) => {
            if (this.activeDialog && (e.code === 'Space' || e.code === 'Enter')) {
                this.advanceDialog();
            }
        });
    }

    // --- SISTEMA DE DIÁLOGOS ---
    showDialog(author, text) {
        this.activeDialog = {
            author: author,
            text: text,
            charIndex: 0,
            timer: 0,
            isFinished: false
        };
        this.isCinematic = true; // Trava input
    }

    advanceDialog() {
        if (!this.activeDialog) return;
        if (this.activeDialog.isFinished) {
            this.activeDialog = null; // Fecha
        } else {
            // Se nao terminou de digitar, skipa pra o final instantaneo
            this.activeDialog.charIndex = this.activeDialog.text.length;
            this.activeDialog.isFinished = true;
        }
    }

    startGame() {
        this.isStarted = true;
        this.engine.start();
        this.resetPhase();
        
        // Registrar Update Adicional na engine (para HUD e Sparks)
        const oldUpdate = this.engine.update.bind(this.engine);
        this.engine.update = (dt) => {
            if (this.engine.isPaused) return; // Não atualizar lógica se pausado
            
            this.bgTime += dt;
            oldUpdate(dt);
            this.updateSparks(dt);
            this.updateEnvParticles(dt);
            
            // Atualiza Projéteis
            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                this.projectiles[i].update(dt);
                if (!this.projectiles[i].active) {
                    this.projectiles.splice(i, 1);
                }
            }
            
            // Loop de Diálogos Máquina de Escrever
            if (this.activeDialog && !this.activeDialog.isFinished) {
                 this.activeDialog.timer += dt;
                 if (this.activeDialog.timer > 0.05) { // 50ms por letra
                      this.activeDialog.timer = 0;
                      this.activeDialog.charIndex++;
                      if (window.audioManager && this.activeDialog.charIndex % 2 === 0) {
                          window.audioManager.playSfx('dialog');
                      }
                      if (this.activeDialog.charIndex >= this.activeDialog.text.length) {
                           this.activeDialog.isFinished = true;
                      }
                 }
            }
            
            // Texto Gigante "HAJIME" central
            if (this.bigTextTimer > 0) {
                 this.bigTextTimer -= dt;
                 if (this.bigTextTimer <= 0) this.bigText = null;
            }

            this.checkPhaseProgression();
            this.updateCinematic(dt);
        };

        const oldDraw = this.engine.draw.bind(this.engine);
        this.engine.draw = () => {
            // Buffer Virtual de Pixel Art (Resolusão 4x menor)
            if (!this.pixelBuffer) {
                this.pixelScale = 4; // 1 pixel virtual = 4x4 pixels reais na tela
                this.pixelBuffer = document.createElement('canvas');
                this.pixelBuffer.width = CANVAS_WIDTH / this.pixelScale; // 200
                this.pixelBuffer.height = CANVAS_HEIGHT / this.pixelScale; // 112
                this.pixelCtx = this.pixelBuffer.getContext('2d');
                this.pixelCtx.imageSmoothingEnabled = false;
                this.engine.ctx.imageSmoothingEnabled = false;
            }

            const pCtx = this.pixelCtx;
            pCtx.save();
            pCtx.clearRect(0, 0, this.pixelBuffer.width, this.pixelBuffer.height);
            pCtx.scale(1 / this.pixelScale, 1 / this.pixelScale); // Aplica física real mas desenha pequeno
            
            if (this.engine.screenShakeTime > 0) {
                const dx = (Math.random() - 0.5) * this.engine.screenShakeIntensity * 2;
                const dy = (Math.random() - 0.5) * this.engine.screenShakeIntensity * 2;
                pCtx.translate(dx, dy);
            }

            // Desenhar fundo customizado no Buffer Pixelado e Parallax
            this.drawDynamicBackground(pCtx, this.bgTime, Math.min(this.currentPhase, 4));

            // Desenhar entidades, Projeteis e Partículas no Buffer
            for (const entity of this.engine.entities) {
                if (entity.draw) entity.draw(pCtx);
            }
            for (const proj of this.projectiles) proj.draw(pCtx);
            this.drawSparks(pCtx);
            
            // Desenhar Grades da frente da jaula para sobrepor a Gueixa na cutscene
            if (this.currentPhase === 4 && this.cinematicStep < 2) {
                 const jx = CANVAS_WIDTH/2 - 50;
                 const jy = GROUND_Y - 90;
                 pCtx.save();
                 pCtx.fillStyle = '#2d3436';
                 for(let bx = jx; bx <= jx + 40; bx += 8) {
                     pCtx.fillRect(bx, jy, 3, 90); // grades da frente
                 }
                 pCtx.restore();
            }
            
            // Desenhar Corações do final
            if (this.hearts && this.currentPhase === 4) {
                 pCtx.fillStyle = '#e74c3c';
                 for (const h of this.hearts) {
                      pCtx.beginPath();
                      pCtx.arc(h.x - 2, h.y, 2, 0, Math.PI * 2);
                      pCtx.arc(h.x + 2, h.y, 2, 0, Math.PI * 2);
                      pCtx.moveTo(h.x - 4, h.y);
                      pCtx.lineTo(h.x, h.y + 4);
                      pCtx.lineTo(h.x + 4, h.y);
                      pCtx.fill();
                 }
            }

            pCtx.restore();

            // Despejar Buffer cru e não-suavizado esticando na tela Final (Pixel Art Effect)
            this.engine.ctx.save();
            this.engine.ctx.imageSmoothingEnabled = false;
            this.engine.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            this.engine.ctx.drawImage(this.pixelBuffer, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            this.engine.ctx.restore();

            // Desenhar UI em HD cristalino com a nova fonte Retro "Press Start 2P"
            this.drawUI(this.engine.ctx);
            
            // Pause Overlay em HD
            if (this.engine.isPaused) {
                this.engine.ctx.save();
                this.engine.ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
                this.engine.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                this.engine.ctx.fillStyle = "white";
                this.engine.ctx.font = "30px 'Press Start 2P'";
                this.engine.ctx.textAlign = "center";
                this.engine.ctx.fillText("PAUSADO", CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
                this.engine.ctx.font = "12px 'Press Start 2P'";
                this.engine.ctx.fillText("Aperte ESC para continuar", CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 40);
                this.engine.ctx.restore();
            }
        };
    }

    resetPhase() {
        this.engine.clearEntities();
        this.sparks = [];
        this.projectiles = [];
        this.envParticles = [];
        this.isCinematic = false;
        this.activeDialog = null;
        this.cinematicTimer = 0;
        this.cinematicStep = 0;
        
        let initialX = 100;

        if (this.currentPhase === 0) {
            // Intro: Casa Japonesa
            this.isCinematic = true;
            initialX = 300;
        } else if (this.currentPhase >= 1 && this.currentPhase <= 4) {
            // Cutscene invadindo Fase (ou Cutscene final 4)
            this.isCinematic = true;
            initialX = -50; 
        }

        this.player = new Player(initialX, GROUND_Y - 80, this.playerName, this.weaponType);
        this.player.input = this.engine.input; 
        
        if (this.currentPhase >= PHASES.length - 1) { // -1 para ignorar a fase final
            this.enemy = null;
        } else {
            // Na Intro (Phase 0), não adiciona Inimigo imediatamente na Engine, vamos criar na hora exata da invasão
            if (this.currentPhase > 0) {
                 this.enemy = new Enemy(600, GROUND_Y - 80, this.currentPhase - 1); // Compensar array shifter (Shogun = 2)
            }
        }

        this.engine.addEntity(this.player);
        if (this.enemy) this.engine.addEntity(this.enemy);

        // Geisha spawn na fase 0
        if (this.currentPhase === 0) {
            if (window.audioManager) window.audioManager.playBgm('menu');
            this.geisha = new Geisha(450, GROUND_Y - 80);
            this.engine.addEntity(this.geisha);
            this.player.forceState(STATES.SIT);
        } else if (this.currentPhase === 1) {
            if (window.audioManager) window.audioManager.playBgm('combat1');
        } else if (this.currentPhase === 2) {
            if (window.audioManager) window.audioManager.playBgm('combat2');
        } else if (this.currentPhase === 3) {
            if (window.audioManager) window.audioManager.playBgm('combat3');
        } else if (this.currentPhase === 4) {
            if (window.audioManager) window.audioManager.playBgm('ending');
            // Geisha presa na cutscene final
            const jx = CANVAS_WIDTH / 2 - 50; 
            this.geisha = new Geisha(jx, GROUND_Y - 80);
            this.geisha.forceState(STATES.SIT); // de joelhos na jaula
            this.engine.addEntity(this.geisha);
            this.hearts = []; // sistema de corações
            this.nightAlpha = 0; // escurecer o céu
            this.sunY = GROUND_Y - 140; // sol começando no alto
        }
    }

    updateCinematic(dt) {
        if (!this.isCinematic) return;

        // CUTSCENE FASE 0: A CASA JAPONESA E O RAPTO DA GUEIXA
        if (this.currentPhase === 0) {
             this.cinematicTimer += dt;
             
             if (this.cinematicStep === 0 && this.cinematicTimer > 2.0) {
                  // Gueixa começa a se aproximar do jogador
                  this.geisha.forceState(STATES.MOVE);
                  this.cinematicStep = 1;
             } 
             else if (this.cinematicStep === 1 && this.geisha.x < this.player.x + 60) {
                  // Gueixa perto, para de andar e senta de novo para aproximar o rosto
                  this.geisha.forceState(STATES.SIT);
                  this.cinematicStep = 2;
                  this.cinematicTimer = 0;
             }
             else if (this.cinematicStep === 2 && this.cinematicTimer > 1.5) {
                  // SHOGUN QUEBRA A PAREDE!
                  this.enemy = new Enemy(850, GROUND_Y - 80, 2); // Shogun (Type 2) for forca maior
                  this.engine.addEntity(this.enemy);
                  this.enemy.forceState(STATES.MOVE);
                  this.enemy.speed = 400; // Veloz assustador
                  this.enemy.direction = -1;
                  this.engine.shake(20, 0.5); // Tremor massivo
                  
                  // Explode Parede Direita
                  for(let i=0; i<30; i++) this.createDustSpark(750, GROUND_Y - Math.random() * 100);
                  
                  // Geisha e Jogador Assustados
                  this.geisha.forceState(STATES.HURT);
                  this.player.forceState(STATES.IDLE); // Levanta
                  
                  this.cinematicStep = 3;
             }
             else if (this.cinematicStep === 3) {
                  this.enemy.x -= this.enemy.speed * dt;
                  if (this.enemy.x <= this.geisha.x) {
                       // Agarrou a Gueixa
                       this.geisha.state = STATES.HURT; // Nao morre, fica nos bracos dele assustada
                       this.geisha.direction = 1; // Vira para frente da fuga
                       this.enemy.speed = 300;
                       this.enemy.direction = 1; // Foge
                       this.showDialog("Shogun", "Ela pertence às Montanhas Douradas agora...");
                       this.cinematicStep = 4;
                  }
             }
             else if (this.cinematicStep === 4) {
                   this.enemy.x += this.enemy.speed * dt; // Foge pra direita
                   
                   // Carrega a Gueixa
                   this.geisha.x = this.enemy.x + 25; // no braço dele
                   this.geisha.y = this.enemy.y - 10; // levantada do chao
                   
                   // Se dialogo fechou E o Shogun já sumiu da tela, Jogador corre atras
                   if (!this.activeDialog && this.enemy.x > CANVAS_WIDTH + 50) {
                       this.player.forceState(STATES.MOVE);
                       this.player.direction = 1;
                       this.player.speed = 250;
                       this.cinematicStep = 5;
                   }
             }
             else if (this.cinematicStep === 5) {
                   this.player.x += this.player.speed * dt;
                   if (this.player.x > CANVAS_WIDTH - 100) {
                        // Fade to Black
                        this.blackScreenAlpha += dt;
                        if (this.blackScreenAlpha >= 1) {
                             this.currentPhase++; // Vai pra Fase 1
                             this.resetPhase();
                        }
                   }
             }
        }
        
        // CUTSCENE FASES DE LUTA (1, 2 e 3)
        else if (this.currentPhase >= 1 && this.currentPhase <= 3) {
             this.cinematicTimer += dt;
             
             // Fade in
             if (this.cinematicStep === 0) {
                  this.blackScreenAlpha -= dt;
                  if (this.blackScreenAlpha <= 0) {
                       this.blackScreenAlpha = 0;
                       this.cinematicStep = 1;
                  }
                  // Entra correndo
                  this.player.forceState(STATES.MOVE);
                  this.player.x += 300 * dt;
             }
             else if (this.cinematicStep === 1) {
                  this.player.forceState(STATES.MOVE);
                  this.player.x += 300 * dt;
                  
                  // Perto de tentar sair do cenário (trombou c o boss invisivel ali)
                  if (this.player.x > this.enemy.x - 80) {
                       // O Sentinela/Boss aparece e bate
                       this.enemy.performAttack('heavy');
                       this.enemy.stateTimer = 0.5; // forca finalizar attack rapido
                       this.player.takeDamage(10, this.enemy);
                       this.player.forceState(STATES.HURT);
                       // Knockback forte para o Início da Tela
                       this.player.vx = -800; // Dobro da forca pra voar longe
                       this.player.vy = -300;
                       this.engine.shake(15, 0.4);
                       this.cinematicStep = 2;
                       this.cinematicTimer = 0;
                  }
             }
             else if (this.cinematicStep === 2) {
                  // Voando para trás até bater no chão perto do começo
                  this.player.x += this.player.vx * dt;
                  this.player.vy += 1500 * dt; // gravidade
                  this.player.y += this.player.vy * dt;
                  
                  // Força travar no canto esquerdo se voou demais
                  if (this.player.x < 50) {
                      this.player.x = 50;
                      this.player.vx = 0;
                  }

                  if (this.player.y >= GROUND_Y - this.player.height) {
                       this.player.y = GROUND_Y - this.player.height;
                       this.player.vx = 0;
                       this.player.forceState(STATES.IDLE);
                       
                       let bossName = "Sentinela";
                       let dialog = "Um tolo cego pela paixão ousa desafiar a montanha? Sua jornada termina aqui.";
                       if (this.currentPhase === 2) {
                           bossName = "Duelista";
                           dialog = "Sua determinação é inútil. A dança das cerejeiras será a última coisa que verá!";
                       } else if (this.currentPhase === 3) {
                           bossName = "O Shogun";
                           dialog = "Insolente! Acha que pode me desafiar e roubar o que é meu? Morra!";
                       }
                       this.showDialog(bossName, dialog);
                       this.cinematicStep = 3;
                  } else {
                       this.player.x += this.player.vx * dt;
                       this.player.vy += 1500 * dt; // gravidade
                       this.player.y += this.player.vy * dt;
                       if (this.player.y > GROUND_Y - this.player.height) this.player.y = GROUND_Y - this.player.height;
                  }
             }
             else if (this.cinematicStep === 3) {
                  // Espera o usuario fechar o falatorio do Boss
                  if (!this.activeDialog) {
                       this.bigText = "3";
                       this.cinematicTimer = 0;
                       this.cinematicStep = 4;
                  }
             }
             else if (this.cinematicStep >= 4 && this.cinematicStep <= 6) {
                  if (this.cinematicTimer > 1.0) {
                       this.cinematicTimer = 0;
                       this.cinematicStep++;
                       if (this.cinematicStep === 5) this.bigText = "2";
                       if (this.cinematicStep === 6) this.bigText = "1";
                       if (this.cinematicStep === 7) {
                            this.bigText = "HAJIME!";
                            this.bigTextTimer = 1.0;
                            this.isCinematic = false; // DEVOLVE CONTROLE!
                       }
                  }
              }
              // CUTSCENE FINAL FASE 3: Pegando a Chave
              else if (this.cinematicStep === 11 && this.currentPhase === 3) {
                   // Andando até o Shogun
                   this.player.x += this.player.speed * dt;
                   if (this.player.x >= this.enemy.x - 40) {
                        this.player.forceState(STATES.SIT); // Ajoelha para pegar
                        this.cinematicStep = 12;
                        this.cinematicTimer = 0;
                   }
              }
              else if (this.cinematicStep === 12 && this.currentPhase === 3) {
                   // Espera 1.5s pegando a chave
                   if (this.cinematicTimer > 1.5) {
                        this.player.forceState(STATES.MOVE);
                        this.player.direction = 1;
                        this.player.speed = 250; // Corre rápido pro próximo mapa
                        this.cinematicStep = 13;
                   }
              }
              else if (this.cinematicStep === 13 && this.currentPhase === 3) {
                   // Corre para a direita fora da tela
                   this.player.x += this.player.speed * dt;
                   if (this.player.x > CANVAS_WIDTH + 50) {
                        this.cinematicStep = 14;
                   }
              }
              else if (this.cinematicStep === 14 && this.currentPhase === 3) {
                   // Fade to Black and change phase
                   this.blackScreenAlpha += dt;
                   if (this.blackScreenAlpha >= 1) {
                        this.blackScreenAlpha = 1;
                        this.cinematicStep = 0;
                        this.currentPhase++; // Vai pra Fase 4 (Cutscene final)
                        this.resetPhase();
                   }
              }
         }
         // CUTSCENE FASE 4 (FINAL FELIZ)
         else if (this.currentPhase === 4) {
              this.cinematicTimer += dt;
              
              if (this.cinematicStep === 0) {
                  // Fade in and run to cage
                  this.blackScreenAlpha -= dt;
                  if (this.blackScreenAlpha <= 0) this.blackScreenAlpha = 0;
                  
                  this.player.forceState(STATES.MOVE);
                  this.player.x += 150 * dt; // ande devagar para a jaula
                  if (this.player.x >= CANVAS_WIDTH / 2 - 80) {
                      this.player.forceState(STATES.LIGHT_ATTACK);
                      this.player.stateTimer = 0.5; // forca a animacao tocar inteira
                      this.cinematicStep = 1;
                      this.cinematicTimer = 0;
                  }
              }
              else if (this.cinematicStep === 1) {
                  // Quebra jaula
                  if (this.cinematicTimer > 0.5) {
                       this.createParrySpark(this.geisha.x, this.geisha.y);
                       for(let i=0; i<10; i++) this.createDustSpark(this.geisha.x, this.geisha.y);
                       this.player.forceState(STATES.IDLE);
                       this.geisha.forceState(STATES.IDLE); // Levanta
                       this.cinematicStep = 2;
                       this.cinematicTimer = 0;
                  }
              }
              else if (this.cinematicStep === 2) {
                  // Geisha corre para o player
                  this.geisha.forceState(STATES.MOVE);
                  this.geisha.direction = -1; // esquerda para o player
                  this.geisha.x -= 100 * dt;
                  if (this.geisha.x <= this.player.x + 30) {
                       this.geisha.forceState(STATES.IDLE); // Ficam pertos
                       this.cinematicStep = 3;
                       this.cinematicTimer = 0;
                  }
              }
              else if (this.cinematicStep === 3) {
                  // Loop de beijo / coracoes e por do sol
                  this.nightAlpha += dt * 0.1; // 10 segundos para noite total
                  this.blackScreenAlpha += dt * 0.1; // escurecer tela gradativamente
                  this.sunY += dt * 8; // sol desce
                  
                  this.geisha.direction = -1;
                  this.player.direction = 1;
                  
                  // Animacao improvisada: player levanta espada como vitoria / abraco
                  if (this.player.state !== STATES.PREPARE_ATTACK) {
                      this.player.changeState(STATES.PREPARE_ATTACK);
                  }
                  
                  // Gera corações!
                  if (Math.random() < 0.05) {
                      this.hearts.push({
                          x: this.player.x + 15 + (Math.random() - 0.5) * 10,
                          y: this.player.y - 20,
                          vy: -15 - Math.random() * 20,
                          vx: (Math.random() - 0.5) * 10,
                          life: 2.0
                      });
                  }
                  
                  // Atualiza corações
                  for (let i = this.hearts.length - 1; i >= 0; i--) {
                      const h = this.hearts[i];
                      h.x += h.vx * dt;
                      h.y += h.vy * dt;
                      h.life -= dt;
                      if (h.life <= 0) this.hearts.splice(i, 1);
                  }
                  
                  // Se ja for noite total
                  if (this.nightAlpha >= 1) {
                      this.nightAlpha = 1;
                      this.bigText = "OBRIGADO POR JOGAR!";
                      this.bigTextTimer = 9999; // Fica para sempre
                  }
              }
         }
    }

    checkPhaseProgression() {
        // Cena de Derrota do Boss
        if (this.currentPhase >= 1 && this.enemy && (this.enemy.state === STATES.DEAD || this.cinematicStep >= 10)) {
             if (this.cinematicStep < 10) { // Usa a variável de step da cutscene (garantindo > 7)
                 this.isCinematic = true;
                 this.cinematicStep = 10;
                 // Força animação especial Ajoelhado no Inimigo morto
                 this.enemy.state = STATES.SIT; 
                 // Cura player simbolicamente p n morrer de sangramento
                 this.player.hp = this.player.maxHp; 
                 
                 let bossName = "Sentinela";
                 let dialog = "Você... Nunca irá conseguir subir as montanhas de neve...";
                 if (this.currentPhase === 2) {
                     bossName = "Duelista";
                     dialog = "O vento congelante... apagará sua chama...";
                 } else if (this.currentPhase === 3) {
                     bossName = "O Shogun";
                     dialog = "Meu império falhou... Mas as sombras nunca esquecem...";
                 }
                 this.showDialog(bossName, dialog);
             }
             
             if (this.cinematicStep === 10 && !this.activeDialog) {
                  // Dialogo fechou, começa transição
                  if (this.currentPhase === 3) {
                       // Começa a animação de pegar a chave
                       this.cinematicStep = 11;
                       this.player.forceState(STATES.MOVE);
                       this.player.direction = 1;
                       this.player.speed = 100; // Anda devagar ate o Shogun
                  } else {
                       this.blackScreenAlpha += 0.5 * (1/60); // dt aproximado para fade out no frame
                       if (this.blackScreenAlpha >= 1) {
                            this.blackScreenAlpha = 1;
                            this.cinematicStep = 11;
                            this.currentPhase++;
                            this.resetPhase();
                       }
                  }
             }
             return;
        }

        if (this.player && this.player.state === STATES.DEAD) {
            // Restart
             if (!this.phaseTransitionTimer) this.phaseTransitionTimer = performance.now();
             if (performance.now() - this.phaseTransitionTimer > 3000) {
                 this.phaseTransitionTimer = null;
                 this.resetPhase();
             }
        }
    }

    createParrySpark(x, y) {
        this.sparks.push({ x, y, radius: 5, maxRadius: 50, life: 1.0, type: 'parry' });
    }

    createHitSpark(x, y) {
        this.sparks.push({ x, y, radius: 2, maxRadius: 20, life: 0.5, type: 'hit' });
    }

    createDustSpark(x, y) {
        this.sparks.push({ 
            x: x, 
            y: y, 
            vx: (Math.random() - 0.5) * 50, // se movem lateral
            vy: -Math.random() * 30, // sobem levemente
            radius: Math.random() * 3 + 2, 
            maxRadius: 8, 
            life: 0.8, 
            type: 'dust' 
        });
    }

    updateSparks(dt) {
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            
            if (s.type === 'dust') {
                s.x += s.vx * dt;
                s.y += s.vy * dt;
                s.radius += dt; // expande de leve
                s.life -= dt * 2;
            } else {
                s.life -= dt * (s.type === 'parry' ? 2 : 4);
                s.radius += (s.maxRadius - s.radius) * 10 * dt; // expansão suave
            }

            if (s.life <= 0) this.sparks.splice(i, 1);
        }
    }

    drawSparks(ctx) {
        for (const s of this.sparks) {
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            if (s.type === 'parry') {
                ctx.fillStyle = `rgba(255, 255, 255, ${s.life})`;
            } else if (s.type === 'hit') {
                ctx.fillStyle = `rgba(255, 0, 0, ${s.life})`;
            } else { // dust
                ctx.fillStyle = `rgba(200, 200, 200, ${s.life * 0.5})`; // acinzentado translucido
            }
            ctx.fill();
        }
    }

    updateEnvParticles(dt) {
        const maxParticles = 60;
        
        if (this.currentPhase === 0) return; // Sem partículas dentro de casa na Cutscene

        // Spawna novas partículas baseadas na fase
        if (this.envParticles.length < maxParticles && Math.random() < 0.2) {
            let type = 'leaf';
            let color = '#27ae60'; // Bambu/Folha
            let phase = this.currentPhase;
            if (phase === 2) { type = 'sakura'; color = '#ffb7c5'; } 
            if (phase >= 3) { type = 'leaf'; color = '#f1c40f'; }   
            
            this.envParticles.push({
                x: Math.random() * CANVAS_WIDTH,
                y: -20,
                vx: (Math.random() - 0.5) * 40 + (phase >= 3 ? 60 : 20), // vento fluindo para direita
                vy: Math.random() * 30 + 20,
                size: Math.random() * 6 + 2,
                angle: Math.random() * Math.PI * 2,
                spinSpeed: (Math.random() - 0.5) * 5,
                type: type,
                color: color
            });
        }

        for (let i = this.envParticles.length - 1; i >= 0; i--) {
            let p = this.envParticles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            
            if (p.type !== 'snow') {
                p.angle += p.spinSpeed * dt;
                p.x += Math.sin(this.bgTime * 2 + p.y * 0.05) * 30 * dt; // planar caindo
            }
            
            if (p.y > CANVAS_HEIGHT + 20) {
                this.envParticles.splice(i, 1);
            }
        }
    }

    drawEnvParticles(ctx) {
        ctx.save();
        for (const p of this.envParticles) {
            ctx.fillStyle = p.color;
            ctx.translate(p.x, p.y);
            if (p.type === 'snow') {
                ctx.beginPath();
                ctx.arc(0, 0, p.size, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.rotate(p.angle);
                ctx.fillRect(-p.size, -p.size/2, p.size*2, p.size);
                ctx.rotate(-p.angle);
            }
            ctx.translate(-p.x, -p.y);
        }
        ctx.restore();
    }

    drawDynamicBackground(ctx, time, phase) {
        const w = CANVAS_WIDTH;
        const h = CANVAS_HEIGHT;
        const groundY = GROUND_Y;
        
        ctx.fillStyle = PHASES[phase].bg;
        ctx.fillRect(0, 0, w, h);
        
        ctx.save();
        if (phase === 0) {
            // Fase 0: Interior da Casa (Intro)
            // Paredes fundas Shoji (Papel e Madeira)
            ctx.fillStyle = '#fdf6e3'; // Papel arroz
            ctx.fillRect(0, groundY - 150, w, 150);
            
            ctx.fillStyle = '#3e2723'; // Madeira Escura
            ctx.fillRect(0, groundY - 150, w, 10); // viga cima
            ctx.fillRect(0, groundY - 5, w, 5); // viga rodape
            for(let x=0; x<=w; x+=60) ctx.fillRect(x, groundY - 150, 4, 150); // divisoes verticais
            for(let y=groundY-110; y<=groundY; y+=40) ctx.fillRect(0, y, w, 3); // horizontais
            
            // Tatame Chão
            ctx.restore();
            ctx.fillStyle = '#a19c72'; // Verde musgo tatame
            ctx.fillRect(0, groundY, w, h - groundY);
            
            // Bordas pretas do tatame
            ctx.fillStyle = '#111';
            for (let i=0; i<3; i++) {
                 ctx.fillRect(0, groundY + i*40, w, 2);
                 ctx.fillRect(w/3, groundY, 2, h);
                 ctx.fillRect(w/1.5, groundY, 2, h);
            }
            ctx.save();
            
            // Mesinha de Chá ao fundo
            ctx.fillStyle = '#2c1e16';
            const mw = 120, mh = 15;
            const mx = w/2 - mw/2;
            const my = groundY + 20;
            ctx.fillRect(mx, my, mw, mh); // tampo
            ctx.fillRect(mx + 10, my+mh, 8, 15); // perna esq
            ctx.fillRect(mx + mw - 18, my+mh, 8, 15); // perna dir
            
            // Bule de Chá (Tetsubin)
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(w/2 - 10, my - 5, 8, 0, Math.PI*2);
            ctx.fill();
            ctx.fillRect(w/2 - 20, my - 10, 10, 4); // cabo bule
        } 
        else if (phase === 1) {
            // Fase 1: Floresta de Bambu
            ctx.fillStyle = '#2d4a22'; // Fundo de folhagem ao longe
            ctx.beginPath();
            ctx.moveTo(0, groundY);
            for(let x=0; x<=w; x+=40) ctx.lineTo(x, groundY - 40 + Math.sin(x*0.05 + time)*20);
            ctx.lineTo(w, groundY);
            ctx.fill();

            // Troncos de Bambu grossos fluídos
            for(let x=30; x<=w; x+=80) {
                let bw = 14 + (Math.abs(Math.sin(x)) * 6);
                ctx.save();
                ctx.translate(x, groundY);
                ctx.rotate(Math.sin(time * 1.5 + x * 0.1) * 0.03); // Sway leve
                ctx.fillStyle = '#3a5f2b'; // Bambu escuro fundo
                ctx.fillRect(0, -groundY, bw, groundY);
                // gomos
                ctx.fillStyle = '#1e3314';
                for(let y=20; y<groundY; y+=50) ctx.fillRect(0, -y, bw, 3);
                ctx.restore();
            }
            for(let x=-10; x<=w; x+=90) {
                let bw = 18 + (Math.abs(Math.cos(x)) * 4);
                ctx.save();
                ctx.translate(x, groundY);
                ctx.rotate(Math.sin(time * 1.2 + x * 0.1) * 0.04);
                ctx.fillStyle = '#4c7c39'; // Bambu mais claro frente
                ctx.fillRect(0, -groundY, bw, groundY);
                // gomos
                ctx.fillStyle = '#2d4a22';
                for(let y=40; y<groundY; y+=60) ctx.fillRect(0, -y, bw, 4);
                ctx.restore();
            }
        } 
        else if (phase === 2) {
            // Fase 2: Coreto Japonês com Sakuras
            ctx.fillStyle = '#bd6243';
            ctx.beginPath();
            ctx.moveTo(0, groundY);
            for(let x=0; x<=w; x+=30) ctx.lineTo(x, groundY - 80 + Math.sin(x*0.01)*40);
            ctx.lineTo(w, groundY);
            ctx.fill();

            // Árvores Sakura (Múltiplas) Animadas com o Vento
            for(let x = 10; x <= w; x += 90) {
                let th = 70 + Math.abs(Math.sin(x))*30;
                let tw = 12 + Math.abs(Math.cos(x))*6;
                
                ctx.save();
                ctx.translate(x + tw/2, groundY); // Base do tronco
                ctx.rotate(Math.sin(time * 1.5 + x * 0.1) * 0.04); // Vento suave
                
                ctx.fillStyle = '#3e2723';
                ctx.fillRect(-tw/2, -th, tw, th);
                
                // Copas Rosa
                ctx.fillStyle = '#ff8ca4';
                ctx.beginPath();
                ctx.arc(0, -th - 5, 35 + Math.abs(Math.sin(x+1))*15, 0, Math.PI*2);
                ctx.arc(-20, -th + 15, 25 + Math.abs(Math.cos(x))*10, 0, Math.PI*2);
                ctx.arc(20, -th + 10, 25, 0, Math.PI*2);
                ctx.fill();
                
                ctx.restore();
            }

            // Coreto Central
            const gx = w/2;
            ctx.fillStyle = '#4a2511';
            ctx.fillRect(gx - 60, groundY - 70, 8, 70);
            ctx.fillRect(gx + 52, groundY - 70, 8, 70);
            ctx.fillRect(gx - 25, groundY - 75, 4, 75);
            ctx.fillRect(gx + 21, groundY - 75, 4, 75);
            
            ctx.fillStyle = '#2d1408'; // Assoalho
            ctx.fillRect(gx - 75, groundY - 10, 150, 10);
            
            ctx.fillStyle = '#1c1c1c'; // Telhado curvo asiático
            ctx.beginPath();
            ctx.moveTo(gx - 85, groundY - 60);
            ctx.quadraticCurveTo(gx - 40, groundY - 100, gx, groundY - 110);
            ctx.quadraticCurveTo(gx + 40, groundY - 100, gx + 85, groundY - 60);
            ctx.lineTo(gx + 60, groundY - 65);
            ctx.lineTo(gx - 60, groundY - 65);
            ctx.fill();

            // Pétalas no chão
            ctx.fillStyle = '#ffb7c5';
            for (let i = 0; i < 40; i++) {
                 let px = (i * 47) % w;
                 let py = groundY + ((i * 17) % (h - groundY));
                 ctx.beginPath();
                 ctx.arc(px, py, 2.5, 0, Math.PI * 2);
                 ctx.fill();
            }
        } 
        else {
            // Fase 3 e 4: Montanhas de Outono e Árvores Amarelas
            let skyColor = '#eb984e';
            if (phase === 4) {
                 let r = Math.max(10, 235 - this.nightAlpha * 225);
                 let g = Math.max(10, 152 - this.nightAlpha * 142);
                 let b = Math.max(20, 78 - this.nightAlpha * 58);
                 skyColor = `rgb(${r}, ${g}, ${b})`;
            }
            
            // Céu de fim de tarde (Por do Sol)
            ctx.fillStyle = skyColor; 
            ctx.beginPath();
            ctx.moveTo(0, groundY);
            for(let x=0; x<=w; x+=25) ctx.lineTo(x, groundY - 140 + Math.sin(x*0.01)*50);
            ctx.lineTo(w, groundY);
            ctx.fill();

            if (phase === 4) {
                 // Sol gigante descendo
                 ctx.fillStyle = `rgba(255, 100, 50, ${1 - this.nightAlpha})`;
                 ctx.beginPath();
                 ctx.arc(w/2 + 80, this.sunY, 40, 0, Math.PI * 2);
                 ctx.fill();
            }

            // Montanhas com Picos Nevados ao fundo
            // Fundo Branco (Neve)
            ctx.fillStyle = '#ecf0f1';
            ctx.beginPath();
            ctx.moveTo(0, groundY);
            for(let x=0; x<=w; x+=30) ctx.lineTo(x, groundY - 135 + Math.sin(x*0.015)*80);
            ctx.lineTo(w, groundY);
            ctx.fill();

            // Frente Marrom (Rocha)
            ctx.fillStyle = '#5d4037';
            ctx.beginPath();
            ctx.moveTo(0, groundY);
            for(let x=0; x<=w; x+=30) ctx.lineTo(x, groundY - 115 + Math.sin(x*0.015)*80 + Math.cos(x*0.1)*8);
            ctx.lineTo(w, groundY);
            ctx.fill();
            
            // Colinas com Árvores Amarelas
            ctx.fillStyle = '#8d6e63';
            ctx.beginPath();
            ctx.moveTo(0, groundY);
            for(let x=0; x<=w; x+=25) ctx.lineTo(x, groundY - 80 + Math.sin(x*0.02 + 10)*40);
            ctx.lineTo(w, groundY);
            ctx.fill();
            
            // Árvores de Outono (Amarelas) Animadas com o Vento
            for(let x = 30; x <= w; x += 110) {
                let th = 50 + Math.abs(Math.sin(x))*30;
                let tw = 10 + Math.abs(Math.cos(x))*4;
                
                ctx.save();
                ctx.translate(x + tw/2, groundY); // Pivô na base do tronco
                ctx.rotate(Math.sin(time * 1.8 + x * 0.1) * 0.05); // Vento um pouco mais forte
                
                ctx.fillStyle = '#3e2723';
                ctx.fillRect(-tw/2, -th, tw, th);
                
                // Copas Amarelas/Alaranjadas
                ctx.fillStyle = '#f1c40f'; // Amarelo vibrante
                ctx.beginPath();
                ctx.arc(0, -th - 5, 25 + Math.abs(Math.sin(x))*10, 0, Math.PI*2);
                ctx.fill();
                ctx.fillStyle = '#e67e22'; // Destaques alaranjados
                ctx.beginPath();
                ctx.arc(-10, -th + 5, 20, 0, Math.PI*2);
                ctx.arc(10, -th + 5, 20, 0, Math.PI*2);
                ctx.fill();
                
                ctx.restore();
            }
            
            // Tori Gate (Portal quebrado) com musgo e folhas
            ctx.fillStyle = '#c0392b';
            ctx.fillRect(w - 100, groundY - 90, 12, 90);
            ctx.fillRect(w - 140, groundY - 80, 12, 80);
            ctx.fillRect(w - 150, groundY - 70, 70, 12);
            ctx.fillRect(w - 155, groundY - 90, 80, 15);
            ctx.fillStyle = '#f1c40f'; // folhas presas no portal
            ctx.fillRect(w - 145, groundY - 92, 10, 5);
            ctx.fillRect(w - 120, groundY - 72, 8, 4);
            
            // Jaula com a Gueixa na Fase 3 e 4
            const jx = w/2 - 50; 
            const jy = groundY - 90;
            
            if (phase === 3) {
                 // Lógica fluida da Gueixa socando a jaula baseada no tempo
                 const panicSpeed = 15;
                 const bangCycle = Math.sin(time * panicSpeed); 
                 const armsExtended = Math.max(0, bangCycle);
                 const isHitting = bangCycle > 0.8; 
                 
                 let shakeX = 0;
                 if (isHitting) {
                      shakeX = (Math.random() - 0.5) * 4;
                 }

                 ctx.save();
                 ctx.translate(shakeX, 0);

                 ctx.fillStyle = '#8e0000'; // kimono 
                 ctx.fillRect(jx + 10, jy + 30, 20, 30);
                 
                 ctx.fillStyle = '#ecf0f1'; // Pele pálida
                 ctx.beginPath();
                 ctx.moveTo(jx + 15, jy + 35);
                 ctx.lineTo(jx + 15 - armsExtended*8, jy + 30);
                 ctx.lineTo(jx + 15 - armsExtended*8, jy + 25);
                 ctx.lineTo(jx + 20, jy + 33);
                 ctx.fill();
                 
                 ctx.beginPath();
                 ctx.moveTo(jx + 25, jy + 35);
                 ctx.lineTo(jx + 25 + armsExtended*8, jy + 30);
                 ctx.lineTo(jx + 25 + armsExtended*8, jy + 25);
                 ctx.lineTo(jx + 20, jy + 33);
                 ctx.fill();

                 ctx.fillStyle = '#111'; // cabelo 
                 ctx.beginPath();
                 ctx.arc(jx + 20 + shakeX*0.5, jy + 25, 8, 0, Math.PI*2);
                 ctx.arc(jx + 15 + shakeX, jy + 28, 5, 0, Math.PI*2);
                 ctx.fill();
                 ctx.restore();
                 
                 // Jaula (Barras)
                 ctx.save();
                 ctx.translate(shakeX*0.3, 0);
                 ctx.fillStyle = '#2d3436';
                 ctx.fillRect(jx, jy, 40, 5); // Teto
                 ctx.fillRect(jx, jy + 90, 40, 5); // Base
                 for(let bx = jx; bx <= jx + 40; bx += 8) {
                     ctx.fillRect(bx, jy, 3, 90); // grades
                 }
                 ctx.restore();
            } else if (phase === 4 && this.cinematicStep < 2) {
                 ctx.save();
                 ctx.fillStyle = '#2d3436';
                 ctx.fillRect(jx, jy, 40, 5); // Teto
                 ctx.fillRect(jx, jy + 90, 40, 5); // Base
                 for(let bx = jx; bx <= jx + 40; bx += 8) {
                     ctx.fillRect(bx, jy, 3, 90); // grades
                 }
                 ctx.restore();
            }
        }
        ctx.restore();
        
        // Chão (apenas se não for Fase 0 que desenha o tatame especial)
        if (phase !== 0) {
             let floorColor = '#111';
             if (phase === 1) floorColor = '#2d4a22'; // Chão bambu
             if (phase === 2) floorColor = '#4e9a06'; // Chão grama verde para Sakura
             if (phase === 3 || phase === 4) floorColor = '#4e342e'; // Terra batida / montanha seca outono
             ctx.fillStyle = floorColor;
             ctx.fillRect(0, groundY, w, h - groundY);
        }
        
        this.drawEnvParticles(ctx);
    }

    drawUI(ctx) {
        // UI não desenha durante Intro (0) ou Cutscene Final (4)
        if (this.currentPhase !== 0 && this.currentPhase !== 4) {
            // Player UI (Left)
            this.drawBars(ctx, 20, 20, this.player, this.playerName);

            // Enemy UI (Right)
            if (this.enemy && this.enemy.state !== STATES.DEAD && !this.isCinematic) {
                const phaseName = this.currentPhase < PHASES.length ? PHASES[this.currentPhase].enemy : "";
                this.drawBars(ctx, CANVAS_WIDTH - 220, 20, this.enemy, phaseName);
            }
        }
        
        if (this.player && this.player.state === STATES.DEAD) {
            ctx.save();
            ctx.fillStyle = "red";
            ctx.font = "30px 'Press Start 2P'";
            ctx.textAlign = "center";
            ctx.fillText("VOCÊ MORREU", CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
            ctx.restore();
        }

        // FADE BLACK SCREEN TRANSIÇÕES
        if (this.blackScreenAlpha > 0) {
            ctx.save();
            ctx.fillStyle = `rgba(0, 0, 0, ${this.blackScreenAlpha})`;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            ctx.restore();
        }

        // TEXTO GIGANTE (Hajime, Obrigado, etc)
        if (this.bigText) {
            ctx.save();
            ctx.fillStyle = "white";
            ctx.strokeStyle = "red";
            ctx.lineWidth = 4;
            
            if (this.bigText === "OBRIGADO POR JOGAR!") {
                 ctx.font = "bold 30px 'Press Start 2P'";
            } else {
                 ctx.font = "bold 60px 'Press Start 2P'";
            }
            
            ctx.textAlign = "center";
            ctx.strokeText(this.bigText, CANVAS_WIDTH/2, CANVAS_HEIGHT/2 - 20);
            ctx.fillText(this.bigText, CANVAS_WIDTH/2, CANVAS_HEIGHT/2 - 20);
            ctx.restore();
        }
        
        // CAIXA DE DIÁLOGOS ESTILO VISUAL NOVEL
        if (this.activeDialog) {
            ctx.save();
            const boxHeight = 100;
            const boxY = CANVAS_HEIGHT - boxHeight - 20;
            const boxX = 40;
            const boxW = CANVAS_WIDTH - 80;
            
            // Fundo Preto Translucido com Borda Branca Grossa
            ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
            ctx.fillRect(boxX, boxY, boxW, boxHeight);
            ctx.strokeStyle = "white";
            ctx.lineWidth = 4;
            ctx.strokeRect(boxX, boxY, boxW, boxHeight);
            
            // Autor em Vermelho
            ctx.fillStyle = "#e74c3c";
            ctx.font = "16px 'Press Start 2P'";
            ctx.textAlign = "left";
            ctx.fillText(this.activeDialog.author, boxX + 20, boxY + 30);
            
            // Texto escrito de formata typewritter
            ctx.fillStyle = "white";
            ctx.font = "12px 'Press Start 2P'";
            const textToShow = this.activeDialog.text.substring(0, this.activeDialog.charIndex);
            
            // Quebra de linha manual básica limitando chars (ex: 45)
            const words = textToShow.split(' ');
            let line = '';
            let lineY = boxY + 60;
            
            for(var n = 0; n < words.length; n++) {
                var testLine = line + words[n] + ' ';
                var metrics = ctx.measureText(testLine);
                if (metrics.width > boxW - 50 && n > 0) {
                    ctx.fillText(line, boxX + 20, lineY);
                    line = words[n] + ' ';
                    lineY += 20;
                } else {
                    line = testLine;
                }
            }
            ctx.fillText(line, boxX + 20, lineY);
            
            // Setinha piscando se terminou
            if (this.activeDialog.isFinished && Math.floor(performance.now() / 400) % 2 === 0) {
                 ctx.fillStyle = "yellow";
                 ctx.fillText("▼", boxX + boxW - 30, boxY + boxHeight - 15);
            }
            ctx.restore();
        }
    }

    drawBars(ctx, x, y, entity, name) {
        ctx.fillStyle = "white";
        ctx.font = "10px 'Press Start 2P'";
        ctx.fillText(name, x, y);

        // HP Bar (Verde)
        ctx.fillStyle = "#333";
        ctx.fillRect(x, y + 10, 200, 15);
        ctx.fillStyle = entity.state === STATES.DEAD ? "#333" : "#2ecc71";
        ctx.fillRect(x, y + 10, 200 * (entity.hp / entity.maxHp), 15);

        // Posture Bar (Amarela)
        const isStunned = entity.state === STATES.STUN;
        const isNearStun = entity.posture / entity.maxPosture < 0.2; // Quase vazia
        
        ctx.fillStyle = "#333";
        ctx.fillRect(x, y + 30, 200, 10);
        
        if (isStunned) {
            ctx.fillStyle = "red"; // Pisca ou semente vermelha quando stun
        } else if (isNearStun && Math.floor(performance.now() / 100) % 2 === 0) {
            ctx.fillStyle = "red"; // Pisca se quase quebrando
        } else {
            ctx.fillStyle = "#f1c40f";
        }
        ctx.fillRect(x, y + 30, 200 * (entity.posture / entity.maxPosture), 10);
    }
}

// Iniciar Menu quando carregar
window.onload = () => {
    new Game(); // apenas instancia as propriedades e liga o menu

    const introContainer = document.getElementById('introLogos');
    const logos = [
        document.getElementById('logo1'),
        document.getElementById('logo2'),
        document.getElementById('logo3'),
        document.getElementById('logo4')
    ];
    let currentLogo = 0;
    let introSkipListener = null;
    let fadeTimeout = null;
    let nextTimeout = null;

    function showNextLogo() {
        if (currentLogo >= logos.length) {
            endIntro();
            return;
        }
        
        logos.forEach(logo => logo.classList.remove('visible'));
        
        const logo = logos[currentLogo];
        logo.classList.add('visible');
        
        fadeTimeout = setTimeout(() => {
            logo.classList.remove('visible');
            nextTimeout = setTimeout(() => {
                currentLogo++;
                showNextLogo();
            }, 800);
        }, 2000);
    }

    function endIntro() {
        clearTimeout(fadeTimeout);
        clearTimeout(nextTimeout);
        if (introContainer) introContainer.style.display = 'none';
        const mainMenu = document.getElementById('mainMenu');
        if (mainMenu) mainMenu.style.display = 'flex';
        window.removeEventListener('keydown', introSkipListener);
    }

    introSkipListener = (e) => {
        if (e.code === 'Space') {
            clearTimeout(fadeTimeout);
            clearTimeout(nextTimeout);
            if (currentLogo < logos.length && logos[currentLogo]) {
                logos[currentLogo].classList.remove('visible');
            }
            currentLogo++;
            if (currentLogo >= logos.length) {
                endIntro();
            } else {
                setTimeout(showNextLogo, 300);
            }
        }
    };

    window.addEventListener('keydown', introSkipListener);

    // Initial delay before first logo
    setTimeout(showNextLogo, 500);
};
