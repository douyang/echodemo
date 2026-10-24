"""Cycles materials of the TAVR video. Every material is a Principled BSDF with a few inputs set;
see-through materials take their alpha from a value node (alpha_<name>) the animation can drive."""
import bpy

PALETTE = {
    # name: base colour, roughness, metallic, alpha, extra
    'myocardium': ((0.50, 0.11, 0.10), 0.42, 0.0, 1.0, {'coat': 0.35}),
    'cut': ((0.33, 0.05, 0.05), 0.65, 0.0, 1.0, {}),
    'aorta': ((0.62, 0.16, 0.13), 0.35, 0.0, 1.0, {'coat': 0.3}),
    'vein': ((0.20, 0.24, 0.50), 0.40, 0.0, 1.0, {'coat': 0.2}),
    'artery': ((0.62, 0.16, 0.13), 0.35, 0.0, 1.0, {'coat': 0.3}),
    'native': ((0.80, 0.68, 0.52), 0.55, 0.0, 1.0, {}),
    'calcium': ((0.93, 0.91, 0.84), 0.75, 0.0, 1.0, {}),
    'chordae': ((0.85, 0.75, 0.66), 0.5, 0.0, 1.0, {}),
    'bone': ((0.86, 0.82, 0.70), 0.6, 0.0, 1.0, {}),
    'ligament': ((0.90, 0.88, 0.80), 0.5, 0.0, 1.0, {}),
    'cobalt': ((0.82, 0.83, 0.86), 0.22, 1.0, 1.0, {}),
    'pet': ((0.95, 0.95, 0.93), 0.85, 0.0, 1.0, {}),
    'bovine': ((0.92, 0.84, 0.70), 0.55, 0.0, 1.0, {}),
    'balloon': ((0.55, 0.72, 0.95), 0.12, 0.0, 0.5, {'coat': 0.6}),
    'shaft': ((0.86, 0.89, 0.95), 0.32, 0.0, 1.0, {'coat': 0.4}),
    'nose': ((0.88, 0.91, 0.96), 0.25, 0.0, 0.85, {'coat': 0.5}),
    'wire': ((0.62, 0.64, 0.66), 0.28, 1.0, 1.0, {}),
    'pigtail': ((0.95, 0.95, 0.98), 0.3, 0.0, 1.0, {'coat': 0.4}),
    'lead': ((0.05, 0.08, 0.16), 0.35, 0.0, 1.0, {'coat': 0.5}),
    'electrode': ((0.75, 0.75, 0.78), 0.2, 1.0, 1.0, {}),
    'sheath': ((0.80, 0.90, 1.00), 0.25, 0.0, 0.55, {'coat': 0.5}),
    'hub': ((0.35, 0.42, 0.50), 0.4, 0.0, 1.0, {'coat': 0.3}),
    'needle': ((0.85, 0.86, 0.88), 0.12, 1.0, 1.0, {}),
    'needlehub': ((0.30, 0.65, 0.45), 0.3, 0.0, 0.8, {'coat': 0.5}),
    'suture': ((0.10, 0.22, 0.75), 0.4, 0.0, 1.0, {}),
    'table': ((0.10, 0.11, 0.12), 0.5, 0.0, 1.0, {}),
    'marker': ((0.25, 0.25, 0.27), 0.3, 1.0, 1.0, {}),
}
SEE_THROUGH = {'aorta', 'artery', 'vein', 'myocardium', 'sheath', 'balloon', 'nose', 'bone', 'ligament'}


def principled(name, color, rough, metal, alpha, extra):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if 'coat' in extra:
        b.inputs['Coat Weight'].default_value = extra['coat']
        b.inputs['Coat Roughness'].default_value = 0.15
    v = nt.nodes.new('ShaderNodeValue')
    v.name = v.label = 'alpha'
    v.outputs[0].default_value = alpha
    nt.links.new(v.outputs[0], b.inputs['Alpha'])
    m.diffuse_color = (*color, 1)
    return m


def skin_material():
    """The body: clear in the middle, denser at its silhouette (a facing ratio), so the anatomy
    inside reads and the outline still holds the body's shape."""
    m = bpy.data.materials.new('skin')
    m.use_nodes = True
    nt = m.node_tree
    nodes, links = nt.nodes, nt.links
    b = nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.78, 0.62, 0.55, 1)
    b.inputs['Roughness'].default_value = 0.5
    b.inputs['Coat Weight'].default_value = 0.2
    lw = nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.35
    ramp = nodes.new('ShaderNodeMapRange')
    ramp.inputs['From Min'].default_value = 0.0
    ramp.inputs['From Max'].default_value = 1.0
    lo = nodes.new('ShaderNodeValue'); lo.name = lo.label = 'alpha_lo'; lo.outputs[0].default_value = 0.04
    hi = nodes.new('ShaderNodeValue'); hi.name = hi.label = 'alpha_hi'; hi.outputs[0].default_value = 0.55
    links.new(lw.outputs['Facing'], ramp.inputs['Value'])
    links.new(lo.outputs[0], ramp.inputs['To Min'])
    links.new(hi.outputs[0], ramp.inputs['To Max'])
    # a focus: the skin fades out beyond `focus_r` cm of the point `focus` (object space, standing frame)
    tc = nodes.new('ShaderNodeTexCoord')
    fp = nodes.new('ShaderNodeCombineXYZ'); fp.name = fp.label = 'focus'
    dist = nodes.new('ShaderNodeVectorMath'); dist.operation = 'DISTANCE'
    fr = nodes.new('ShaderNodeValue'); fr.name = fr.label = 'focus_r'; fr.outputs[0].default_value = 1000.0
    fall = nodes.new('ShaderNodeMapRange'); fall.interpolation_type = 'SMOOTHSTEP'
    fall.inputs['To Min'].default_value = 1.0
    fall.inputs['To Max'].default_value = 0.0
    half = nodes.new('ShaderNodeMath'); half.operation = 'MULTIPLY'; half.inputs[1].default_value = 0.55
    links.new(tc.outputs['Object'], dist.inputs[0])
    links.new(fp.outputs[0], dist.inputs[1])
    links.new(dist.outputs['Value'], fall.inputs['Value'])
    links.new(fr.outputs[0], half.inputs[0])
    links.new(half.outputs[0], fall.inputs['From Min'])
    links.new(fr.outputs[0], fall.inputs['From Max'])
    mul = nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    links.new(ramp.outputs['Result'], mul.inputs[0])
    links.new(fall.outputs['Result'], mul.inputs[1])
    # cull: 1 hides the skin's back faces (the far side seen from inside), for the close views
    geo = nodes.new('ShaderNodeNewGeometry')
    cull = nodes.new('ShaderNodeValue'); cull.name = cull.label = 'cull'; cull.outputs[0].default_value = 0.0
    bf = nodes.new('ShaderNodeMath'); bf.operation = 'MULTIPLY'
    links.new(geo.outputs['Backfacing'], bf.inputs[0])
    links.new(cull.outputs[0], bf.inputs[1])
    keep = nodes.new('ShaderNodeMath'); keep.operation = 'SUBTRACT'; keep.inputs[0].default_value = 1.0
    links.new(bf.outputs[0], keep.inputs[1])
    mul2 = nodes.new('ShaderNodeMath'); mul2.operation = 'MULTIPLY'
    links.new(mul.outputs[0], mul2.inputs[0])
    links.new(keep.outputs[0], mul2.inputs[1])
    links.new(mul2.outputs[0], b.inputs['Alpha'])
    m.diffuse_color = (0.78, 0.62, 0.55, 0.3)
    return m


def glow_material():
    """The highlighted path: emission whose strength the animation drives (glow node)."""
    m = bpy.data.materials.new('glow')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (0.30, 0.78, 1.0, 1)
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    v = nt.nodes.new('ShaderNodeValue'); v.name = v.label = 'glow'; v.outputs[0].default_value = 0.0
    nt.links.new(v.outputs[0], mix.inputs['Fac'])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    em.inputs['Strength'].default_value = 14.0
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    return m


def build():
    M = {k: principled(k, *v) for k, v in PALETTE.items()}
    M['skin'] = skin_material()
    M['glow'] = glow_material()
    return M


def set_alpha(m, a):
    m.node_tree.nodes['alpha'].outputs[0].default_value = a
