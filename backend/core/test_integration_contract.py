import pytest
from django.test import override_settings
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_public_schema_matches_camel_case_responses():
    client = APIClient()
    schema_response = client.get('/api/v1/schema/', HTTP_ACCEPT='application/vnd.oai.openapi+json')
    assert schema_response.status_code == 200
    schemas = schema_response.json()['components']['schemas']
    paths = schema_response.json()['paths']
    params = {item['name'] for item in paths['/api/v1/motifs']['get']['parameters']}
    assert {'category', 'q', 'ids', 'ordering', 'page', 'pageSize'} <= params
    related = paths['/api/v1/motifs/{slug}/related']['get']['responses']['200']['content']['application/json']['schema']
    assert related['type'] == 'array'
    assert schemas['MotifDetail']['properties']['images']['type'] == 'array'
    for path, name in [
        ('/api/v1/config', 'ConfigResponse'),
        ('/api/v1/catalog/options', 'CatalogOptionsResponse'),
    ]:
        response = client.get(path)
        assert response.status_code == 200
        assert set(response.json()) == set(schemas[name]['properties'])
        assert set(schemas[name]['required']) <= set(response.json())
        assert all('_' not in key for key in schemas[name]['properties'])


@pytest.mark.django_db
@override_settings(CORS_ALLOWED_ORIGINS=['http://localhost:5173'])
def test_cors_only_allows_configured_frontend_with_credentials():
    client = APIClient()
    for origin, allowed in [('http://localhost:5173', True), ('https://untrusted.example', False)]:
        response = client.options(
            '/api/v1/config',
            HTTP_ORIGIN=origin,
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='GET',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS='content-type,x-csrftoken',
        )
        assert response.status_code == 200
        if allowed:
            assert response['Access-Control-Allow-Origin'] == origin
            assert response['Access-Control-Allow-Credentials'] == 'true'
            assert 'x-csrftoken' in response['Access-Control-Allow-Headers']
        else:
            assert 'Access-Control-Allow-Origin' not in response
