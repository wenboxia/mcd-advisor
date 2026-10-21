// Plain-text rendering: one answer first, evidence (receipt) last.
const yuan = (cents) => `¥${(cents / 100).toFixed(1)}`;
const lineText = (l) => `${l.name}${l.quantity > 1 ? ` ×${l.quantity}` : ''}${l.couponTitle ? `（用券：${l.couponTitle}）` : ''}`;
const cartText = (lines) => lines.map(lineText).join(' + ');

export function renderClarification(r) {
  const out = [`我需要你确认一下：`];
  for (const p of r.needsClarification) {
    if (p.notFound) out.push(`  · 「${p.said}」这家店现在的菜单里没找到。请说具体的餐品，例如「麦辣鸡腿堡 中薯 中可乐」。`);
    else if (p.options.length === 1) out.push(`  · 「${p.said}」是指「${p.options[0]}」吗？`);
    else out.push(`  · 「${p.said}」是指哪一个？${p.options.map((o) => `「${o}」`).join(' / ')}`);
  }
  return out.join('\n');
}

export function render(r) {
  if (r.needsClarification) return renderClarification(r);
  const out = [];
  out.push(`麦麦参谋 · ${r.store.storeName}（到店自取）· ${r.time || ''}`);
  const assumed = r.items.filter((i) => i.assumedSize).map((i) => i.said);
  out.push(`你要的：${r.items.map((i) => `${i.name} ×${i.qty}`).join(' · ')}${assumed.length ? `　（${assumed.join('、')}没说大小，按中份）` : ''}`);
  for (const c of r.combos || []) out.push(`　（「${c.name}」按默认搭配拆成：${c.contents.join('、')}）`);
  if (r.partialMenu?.length) out.push(`　（这次有 ${r.partialMenu.length} 个商品的详情没取到，没有参与比较）`);
  out.push('');

  if (r.noPlan) {
    out.push(`⚪ 这家店现在没有办法「一模一样」地买到这一顿${r.noPlan.onlyInCombos.length ? `：${r.noPlan.onlyInCombos.join('、')}只在套餐里卖，而那些套餐会多出别的东西` : ''}。`);
    out.push('   可以换一种规格，或者去 App 里看看哪个套餐最接近。');
    return out.join('\n');
  }
  const best = r.recommended;
  if (!best) {
    out.push('⚪ 这次没有拿到任何官方核价结果，不给建议。');
    for (const u of r.unknown) out.push(`  · ${cartText(u.lines)}：${u.reason}`);
    return out.join('\n');
  }
  if (r.keepOriginal) {
    out.push(`✅ 保持原来的点法就好：${cartText(best.lines)} ${yuan(best.quote.price)}（官方核价）`);
    out.push('   没有找到更便宜的同餐买法。');
  } else {
    out.push(`✅ 建议：${cartText(best.lines)} ${yuan(best.quote.price)}（官方核价）`);
    const parts = ['你要的一样不少'];
    if (r.saving > 0) parts.push(`比分开点（${yuan(r.baseline.quote.price)}）少付 ${yuan(r.saving)}`);
    out.push(`   ${parts.join('；')}`);
  }

  // At most one same-price twin, then the "order separately" baseline, then the next distinct price.
  const others = [];
  const twin = r.alternatives.find((c) => c.quote.price === best.quote.price);
  if (twin) others.push(twin);
  const base = r.alternatives.find((c) => r.baseline && c.signature === r.baseline.signature);
  if (base && !others.includes(base)) others.push(base);
  const next = r.alternatives.find((c) => c.quote.price > best.quote.price && !others.includes(c));
  if (next && others.length < 3) others.push(next);
  if (others.length) {
    out.push('');
    out.push('  其他已核价的买法');
    for (const c of others) out.push(`   · ${cartText(c.lines)} ${yuan(c.quote.price)}${c.quote.price === best.quote.price ? '（同价）' : ''}`);
  }

  for (const n of r.notices) {
    out.push('');
    out.push(`  ⚠️ 菜单上「${n.name}」显示 ${yuan(n.menuPrice)}：这个价要随单加购会员卡（${n.discountType}）。`);
    const bits = [];
    if (n.plain.status === 'verified') bits.push(`不加卡官方核价 ${yuan(n.plain.price)}`);
    if (n.withCard.status === 'verified') bits.push(`加「${n.card?.name || '会员卡'}${n.card ? ` ${yuan(n.card.price)}` : ''}」后 ${yuan(n.withCard.price)}（含卡费）`);
    if (n.extras.length) bits.push(`而且会多一份${n.extras.join('、')}`);
    out.push(`     ${bits.join('；')}。不推荐为了这个价去买卡。`);
  }
  if (r.pending.length) {
    out.push('');
    out.push(`  🟡 可领券${r.pending.map((p) => `「${p.title}」`).join('、')}可能用得上：还没领，领了才能核价，所以不参与排名。`);
    out.push(`     领取会一次领取全部 ${r.claimableCount} 张可领券（官方接口不能只领一张）。想试的话加 --claim。`);
  }

  out.push('');
  out.push(`账单　核价编号 ${best.quote.traceId?.slice(0, 12) || '-'}… · ${best.quote.at || ''}`);
  out.push(`  门店　${r.store.storeName}（${r.store.storeCode}）· 到店`);
  for (const l of best.lines) {
    const sub = best.quote.productList?.find((p) => p.productCode === l.productCode);
    out.push(`  商品　${lineText(l)}${sub ? `　${yuan(sub.subtotal)}` : ''}`);
    if (l.contents?.length > 1) out.push(`  　　　└ ${l.contents.join(' / ')}`);
  }
  out.push(`  优惠　${best.quote.discount ? yuan(best.quote.discount) : '无'}`);
  out.push(`  实付　${yuan(best.quote.price)}（官方 calculate-price）`);
  out.push('  价格只代表这家店此刻的报价；去 App 下单时以 App 显示为准。');
  out.push('');
  out.push(`用时 ${(r.ms / 1000).toFixed(1)} 秒 · 找到 ${r.searched} 种同餐买法 · 官方核价成功 ${r.alternatives.length + 1} 种${r.unknown.length ? `，${r.unknown.length} 种官方未能报价（不参与排名）` : ''}`);
  return out.join('\n');
}
