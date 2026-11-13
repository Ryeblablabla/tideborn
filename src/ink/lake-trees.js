import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { random } from '../rules.js';
import { taperedBranch } from './valley-pines.js';

const silhouettes = {
  willow: {
    trunks: [
      [.20, [[0,-.24,0],[-.19,.84,.01],[.08,1.82,.12],[.70,2.72,.18],[1.24,3.03,.12]]],
      [.10, [[-.03,1.31,.08],[-.68,2.09,.05],[-1.28,2.34,-.13]]],
      [.07, [[.27,2.19,.13],[.45,2.75,-.34],[.48,3.19,-.68]]],
    ],
    fans: [
      [1.12,2.96,.12,1.22,1.56,5], [.49,3.13,-.66,.70,1.26,3],
      [-1.19,2.32,-.11,-.84,1.20,4], [.64,2.69,.37,.56,1.12,3],
    ],
    bark: '#4d4b3b', leaves: '#777b53',
  },
  tree: {
    trunks: [
      [.16, [[0,-.22,0],[.18,.95,.10],[.04,1.92,.05],[-.32,2.91,-.04],[-.30,3.48,.12]]],
      [.075, [[.13,1.48,.07],[-.43,1.99,.13],[-.86,2.68,.38]]],
      [.064, [[-.04,2.20,.02],[.54,2.69,-.23],[.83,3.16,-.28]]],
      [.038, [[.06,1.59,.07],[.59,1.89,.43],[.84,2.28,.64]]],
    ],
    fans: [
      [-.30,3.46,.13,-.18,.61,4], [-.83,2.64,.36,-.78,.55,4],
      [.80,3.11,-.27,.63,.58,4], [.79,2.22,.62,.52,.53,3],
    ],
    bark: '#655141', leaves: '#8a7959',
  },
};

function leafInk(x,y,z,width,height,angle) {
  const geometry = new THREE.SphereGeometry(1,5,3);
  geometry.deleteAttribute('uv');
  geometry.scale(width,height,width*.70);
  geometry.rotateZ(angle);
  geometry.translate(x,y,z);
  const ink = new Float32Array(geometry.attributes.position.count * 2);
  for(let i=0; i<ink.length; i+=2)ink[i]=.22;
  geometry.setAttribute('inkGuides',new THREE.BufferAttribute(ink,2));
  return geometry;
}

function treeMesh(environment,root,parts,site,tint,amount,tone) {
  const geometry=mergeGeometries(parts);
  for(const part of parts)part.dispose();
  geometry.scale(site.size,site.size,site.size);
  geometry.rotateY(site.facing);
  return environment.add(root,geometry,[site.x,site.y,site.z],{
    tint,amount,profile:{strokes:false,geometryInfluence:0,toneRange:tone,coherentInk:.24},
  });
}

export function addLakeTree(environment,root,site,form,seed) {
  const silhouette=silhouettes[form],rng=random(seed);
  const willow=form==='willow';
  const wood=silhouette.trunks.map(([radius,path])=>taperedBranch(radius,path));
  const leaves=[];
  for(const [x,y,z,reach,length,count] of silhouette.fans) {
    for(let i=0;i<count;i++) {
      const fraction=(i+.6)/count;
      const dx=reach*(fraction*.9+.13*rng()),dz=(rng()-.5)*.72;
      const rise=.25+.16*rng();
      const fall=willow?-length*(.65+rng()*.32):length*(.54+rng()*.45);
      const path=[[x,y,z],[x+dx*.54,y+rise,z+dz*.57],[x+dx,y+fall,z+dz]];
      wood.push(taperedBranch(willow?.024:.034,path));
      const leafCount=willow?5:3;
      for(let k=0;k<leafCount;k++) {
        const along=.40+k*.54/(leafCount-1);
        const a=along*(1-along)*4;
        const xx=x+dx*along+(k%2 ? -.07 : .07)+(rng()-.5)*.09;
        const yy=y+fall*along+a*rise;
        const zz=z+dz*along+(rng()-.5)*.21;
        const width=willow?.037+rng()*.027:.064+rng()*.048;
        leaves.push(leafInk(xx,yy,zz,width,willow?width*1.96:width*.68,(rng()-.5)*.9));
      }
    }
  }
  const trunk=treeMesh(environment,root,wood,site,silhouette.bark,.38,[.28,.57]);
  const leaf=treeMesh(environment,root,leaves,site,silhouette.leaves,.50,[.16,.40]);
  trunk.name=willow?'湖堤垂柳':'汀洲疏枝';
  leaf.name=willow?'散点柳叶':'疏木淡叶';
}
