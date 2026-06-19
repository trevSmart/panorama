@IsTest
private class PanoramaApiTest {
    @IsTest
    static void getCapabilitiesRoute() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/panorama/v1/capabilities';
        req.httpMethod = 'GET';
        RestContext.request = req;
        RestContext.response = new RestResponse();
        Test.startTest();
        PanoramaApi.handleGet();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode);
        Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(
            RestContext.response.responseBody.toString());
        System.assert(body.containsKey('canChangeSkills'), 'capabilities payload');
    }
}
