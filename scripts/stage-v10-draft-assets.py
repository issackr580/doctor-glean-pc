"""One-off manual PC staging. Never creates or publishes a release."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import subprocess
import zipfile

REPO = 'issackr580/doctor-glean-pc'
COMMIT = '2aef5b3235f5875196983c5b6581c7731418f30f'
VERSION = '0.1.0-preview.10'
OLD_VERSION = '0.1.0-preview.9'
ROOT = Path.cwd()
OUT = ROOT.parent / 'output/pc' / VERSION
TEMP = Path(os.environ['RUNNER_TEMP']) / 'pc-preview-10'
RELEASES = {'developer': 424916642, 'distribution': 424926935}
PREVIOUS = {
    'developer': (678642718, 'd36d5dfa2d81a097eb49060b9b550f3286a836677c6036905de5e1807d5e54f9'),
    'distribution': (678643661, '0c0b85cd89b8eb80f3eb25e85de1b72050d69b7b6359295ec194fe4353f84c9f'),
}
# Canonical per-file inventories of the locally tested frozen Windows packages.
EXPECTED = {
    'developer': 'f952bb612eb20766a5fa9abfe4ae54e6bd36a9e67370d0744c6faf91e59cc575',
    'distribution': '68a190d6d47e67cd7901ae91cfbfdf70fd8ebbefa03c24737a8c5412d3ed8960',
    'source': '6a37e16a45a0a9bd96f19173effe5ac8319e18e1af80fcd004a7d13331310b32',
}


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def canonical(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()


def run(args, authenticated=False):
    env = dict(os.environ)
    if not authenticated:
        env.pop('GH_TOKEN', None)
        env.pop('GITHUB_TOKEN', None)
    subprocess.run(args, check=True, env=env, timeout=600)


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', path], text=True, timeout=120))


def draft(edition):
    release = api(f'repos/{REPO}/releases/{RELEASES[edition]}')
    tag = ('pc-developer-v' if edition == 'developer' else 'pc-v') + VERSION
    assert release['draft'] is True and release['prerelease'] is True
    assert release['target_commitish'] == COMMIT and release['tag_name'] == tag
    return release


def archive_inventory(path, folder_name, extract_to=None):
    files = {}
    with zipfile.ZipFile(path) as archive:
        for member in archive.infolist():
            p = PurePosixPath(member.filename)
            assert p.parts and p.parts[0] == folder_name and not p.is_absolute()
            assert '..' not in p.parts and '\\' not in member.filename
            assert not stat.S_ISLNK(member.external_attr >> 16)
            if not member.is_dir():
                relative = '/'.join(p.parts[1:])
                assert relative not in files
                files[relative] = hashlib.sha256(archive.read(member)).hexdigest()
        if extract_to is not None:
            archive.extractall(extract_to)
    return files


def old_artifact(edition):
    directory = TEMP / 'previous' / edition
    directory.mkdir(parents=True)
    name = 'doctor-glean-pc' + ('-developer' if edition == 'developer' else '') + '-v' + OLD_VERSION + '-windows-x64'
    path = directory / (name + '.zip')
    asset_id, expected = PREVIOUS[edition]
    with path.open('wb') as stream:
        subprocess.run(['gh', 'api', '-H', 'Accept: application/octet-stream', f'repos/{REPO}/releases/assets/{asset_id}'], stdout=stream, check=True, timeout=300)
    assert digest(path) == expected
    files = archive_inventory(path, name, directory)
    package = json.loads((directory / name / 'resources/app/package.json').read_text())
    assert package['version'] == OLD_VERSION and package['doctorGleanEdition'] == edition
    report = {'version': OLD_VERSION, 'edition': edition, 'applicationId': 'kr.webinar.planner.pc.developer' if edition == 'developer' else 'kr.webinar.planner.pc.app', 'executable': 'DoctorGlean-Developer.exe' if edition == 'developer' else 'DoctorGlean.exe', 'electronVersion': '45.0.0', 'files': files}
    (directory / 'BUILD_VERIFICATION.json').write_text(json.dumps(report))
    return directory


def main():
    assert os.environ['GITHUB_REPOSITORY'] == REPO and os.environ['GITHUB_ACTOR'] == 'issackr580'
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == COMMIT
    assert not subprocess.check_output(['git', 'status', '--porcelain'], text=True).strip()
    assert subprocess.check_output(['node', '--version'], text=True).strip() == 'v24.19.0'
    assert subprocess.check_output(['npm', '--version'], text=True).strip().startswith('11.')
    TEMP.mkdir(parents=True)
    initial = {edition: draft(edition) for edition in RELEASES}
    run(['npm', 'ci'])
    run(['npm', 'test'])
    run(['npm', 'run', 'check'])
    paths = {}
    # Validate both editions and source before uploading anything.
    for edition in RELEASES:
        previous = old_artifact(edition)
        run(['npm', 'run', 'build:' + edition])
        directory = OUT / edition
        report = json.loads((directory / 'BUILD_VERIFICATION.json').read_text())
        assert report['sourceCommit'] == COMMIT and report['workingTreeClean'] is True
        assert report['version'] == VERSION and report['edition'] == edition and report['electronVersion'] == '45.0.0'
        assert canonical(report['files']) == EXPECTED[edition]
        full = next(p for p in directory.glob('*.zip') if 'patch' not in p.name)
        assert digest(full) == report['zip']
        assert archive_inventory(full, full.stem) == report['files']
        run(['node', 'scripts/build-app-patch.mjs', '--from=' + str(previous), '--to=' + str(directory), '--edition=' + edition, '--output=' + str(directory)])
        patch = json.loads((directory / 'PATCH_VERIFICATION.json').read_text())
        assert patch['fromVersion'] == OLD_VERSION and patch['toVersion'] == VERSION
        assert digest(directory / patch['zip']) == patch['sha256']
        (directory / 'RELEASE_NOTES.txt').write_text(initial[edition]['body'])
        paths[edition] = sorted(directory.glob('*.zip')) + [directory / name for name in ['SHA256SUMS.txt', 'PATCH_SHA256SUMS.txt', 'RELEASE_NOTES.txt']]
        assert len(paths[edition]) == 5
    source = OUT / 'source'
    run(['npm', 'run', 'source:pack', '--', '--output=' + str(source)])
    report = json.loads((source / 'SOURCE_VERIFICATION.json').read_text())
    assert report['sourceCommit'] == COMMIT and report['workingTreeClean'] is True
    assert len(report['files']) == 136 and canonical(report['files']) == EXPECTED['source']
    assert digest(source / report['zip']) == report['sha256']
    paths['distribution'] += [source / report['zip'], source / 'SOURCE_SHA256SUMS.txt']
    for edition, files in paths.items():
        release = draft(edition)
        expected_names = {p.name for p in files}
        existing = {a['name']: a for a in release['assets']}
        assert not (set(existing) - expected_names)
        for path in files:
            if path.name in existing:
                asset = existing[path.name]
                assert asset['digest'] == 'sha256:' + digest(path) and asset['size'] == path.stat().st_size
            else:
                run(['gh', 'release', 'upload', release['tag_name'], str(path), '--repo', REPO], authenticated=True)
        release = draft(edition)
        actual = {a['name']: a for a in release['assets']}
        assert set(actual) == expected_names
        for path in files:
            assert actual[path.name]['digest'] == 'sha256:' + digest(path)
            assert actual[path.name]['size'] == path.stat().st_size
        print(edition + ': verified Draft assets ' + str(len(actual)), flush=True)
    print('Both releases remain Draft; public publication requires separate verified release API action.', flush=True)


if __name__ == '__main__':
    main()
