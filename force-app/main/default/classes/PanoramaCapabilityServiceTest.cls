@IsTest
private class PanoramaCapabilityServiceTest {
    @IsTest
    static void getCapabilitiesReturnsAllKeys() {
        Test.startTest();
        PanoramaCapabilityService.CapabilitiesDto dto = PanoramaCapabilityService.getCapabilities();
        Test.stopTest();
        System.assertNotEquals(null, dto);
        // canChangeSkills must mirror ServiceResourceSkill CRUD for the running user.
        Boolean expectedSkills =
            Schema.sObjectType.ServiceResourceSkill.isCreateable()
            && Schema.sObjectType.ServiceResourceSkill.isUpdateable()
            && Schema.sObjectType.ServiceResourceSkill.isDeletable();
        System.assertEquals(expectedSkills, dto.canChangeSkills);
        // Reassign and presence are never backend-supported.
        System.assertEquals(false, dto.canReassignWork);
        System.assertEquals(false, dto.canChangePresence);
    }
}
