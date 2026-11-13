export function beginTrialHits(game, weaponUid) {
  const trial=game.marketTrial;
  if(trial?.weaponUid!==weaponUid||weaponUid==null)return null;
  const serial=(trial.castSerial??0)+1;
  trial.castSerial=serial;
  return {serial,hits:new Set(),pushed:new Set(),strongest:0,branch:0};
}

export function recordTrialHit(game, receipt, targetId, amount, branch=false) {
  const trial=game.marketTrial;
  if(!receipt||!trial||amount<=0||receipt.serial<(trial.resultSerial??0))return;
  receipt.hits.add(targetId);
  receipt.strongest=Math.max(receipt.strongest,amount);
  if(branch)receipt.branch=amount;
  trial.resultSerial=receipt.serial;
  trial.result={targets:receipt.hits.size,pushed:receipt.pushed.size,strongest:receipt.strongest,branch:receipt.branch,until:game.time+1.45};
}

export function recordTrialPush(game, receipt, targetId) {
  const trial=game.marketTrial;
  if(!receipt||trial?.resultSerial!==receipt.serial||!receipt.hits.has(targetId))return;
  receipt.pushed.add(targetId);
  trial.result.pushed=receipt.pushed.size;
}
