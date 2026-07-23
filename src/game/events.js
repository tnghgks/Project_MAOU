import Phaser from 'phaser';

// 순간적으로 터지는 사건 버스 (지속값은 store).
// Phaser → React:  'chat:line' {who,msg,color} · 'donation:arrive' {amount,donor} · 'rhythm:result' {grade,mult}
// React → Phaser:  'ui:startBroadcast' · 'ui:buyUpgrade' {key} · 'ui:buySkill' · 'ui:startNext' · 'ui:selectSkill' {id}
export const bus = new Phaser.Events.EventEmitter();
