// The roof UV follows the intact surface and also each broken ceramic section.
export const portalRoofInk = /* glsl */ `
  vec3 rest=vPaint/uObjectScale+uCenter;
  float tier=smoothstep(16.,19.1,rest.y);
  float slope=abs(vRoofPlane.y);
  float across=vRoofPlane.x;
  float stroke=across/(.86+.14*slope);
  float facade=sign(vRoofPlane.y);
  float strand=stroke+slope*(.105+.064*tier)+.023*sin(slope*6.8+2.05*facade);
  // Load is laid down across the structure. Slightly different pressure
  // on the two tiers avoids stamped, parallel bright stripes.
  float swell=fbm(vec3(strand*2.7+6.8,tier*1.47+4.8,slope*.78+facade*.31));
  float blotted=fbm(vec3(strand*4.7+swell*.66,slope*2.6+7.6,tier*2.22+3.1));
  float jitter=noise3(vec3(strand*26.3+slope*.73,2.14+slope*7.2,4.31+tier*1.7));
  float deposit=1.-smoothstep(.54,.76,abs(slope-(.52+.19*(swell-.50))));
  float shoulder=smoothstep(.17,.51,deposit)*(.27+.73*smoothstep(.23,.68,blotted));
  float lip=smoothstep(.69,.94,slope);
  float ridge=1.-smoothstep(.069,.25,slope);
  float hip=smoothstep(.60,.98,abs(across));
  float blackFold=clamp(.67*shoulder+.64*lip+.23*ridge+.29*hip,0.,1.);

  // Porous clay after the large loaded brush. Pigment first drops in
  // small pores along each uneven stroke, then only the split fibers stop.
  float ragged=slope+.19*(swell-.5)+.034*(jitter-.5)+.048*across;
  float run=1.-smoothstep(.032,.17,abs(ragged-(.68-.066*tier)));
  float cluster=smoothstep(.33,.68,blotted+.11*jitter);
  float fan=strand+.051*(swell-.5)+.019*(jitter-.5);
  float cutA=(1.-smoothstep(.026,.18,abs(fan+.21+.11*tier)))
    *smoothstep(.24,.40,slope)*(1.-smoothstep(.68,.90,slope));
  float cutB=(1.-smoothstep(.035,.23,abs(fan-.43+.095*facade)))
    *smoothstep(.32,.53,slope)*(1.-smoothstep(.76,.91,slope));
  float paperEdge=max(run*cluster*.78,max(cutA*.63,cutB*.52))*(1.-.92*hip)*(1.-.77*lip);
  float tooth=noise3(vec3(strand*31.7+2.1*swell,slope*3.53+4.4,tier*1.8+7.1));
  float drag=noise3(vec3(strand*83.+jitter*1.23,slope*7.9+(1.1*blotted),9.3+facade));
  float fleck=fwidth(strand);
  float dryFibers=smoothstep(.32,.71,tooth+.24*(drag-.49))
    *(1.-.68*smoothstep(.004,.031,fleck));
  float teeth=smoothstep(.27,.74,jitter*.59+.41*drag);
  float wane=paperEdge*(.15+.85*dryFibers)*(.37+.63*teeth);
  float held=smoothstep(.17,.73,swell);
  float litBed=1.-smoothstep(.060,.28,abs(ragged-.44+.06*tier));
  float terrace=litBed*held*(.15+.30*teeth);
  float hold=uPalaceSurfaceInk;
  float density=mix(.64,1.44,blackFold)-.17*blotted;
  pigment=mix(pigment,density-.25*terrace-.47*wane,.86*hold);
  pigment*=1.-hold*.11*dryFibers*paperEdge;
  // Broad patches stay inside mid-ink. Small asymmetric gaps in tooth
  // can reach paper but never add up to an untextured white panel.
  float bare=paperEdge*dryFibers*dryFibers*smoothstep(.52,.74,teeth);
  paperReserve=min(.60,max(paperReserve,hold*(.14*terrace+.34*wane+.35*bare)));
`;
